import { z } from 'zod';
import { choiceWords } from '../agent/choices';
import { LANGUAGES } from '../languages';
import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError, invalid, missing } from '../http';
import { allow, allowTeam, inWorkspace, uuid, type Context } from './shared';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const KIND_LABELS: Record<string, string> = { leave: 'On leave', sick: 'Sick', off: 'Day off' };
const day = z.iso.date();
const addSchema = z.object({ user_id: uuid, kind: z.enum(['leave', 'sick', 'off']), starts_on: day, ends_on: day.optional(), note: z.string().trim().max(200).optional() }).strict();
const offDaysSchema = z.object({ off_days: z.array(z.number().int().min(0).max(6)).max(6) }).strict();

/** Why a person can't take work on a day, or null when he is free. Weekly off days and leave both count. */
export async function offReason(db: PoolClient, ws: string, user: string, date: string) {
  const r = (await db.query(
    `SELECT (SELECT EXTRACT(DOW FROM $3::date)::smallint = ANY(m.off_days) FROM members m WHERE m.workspace_id=$1 AND m.user_id=$2) AS weekly,
      (SELECT kind FROM time_off t WHERE t.workspace_id=$1 AND t.user_id=$2 AND t.status='approved' AND $3::date BETWEEN t.starts_on AND t.ends_on ORDER BY created_at DESC LIMIT 1) AS kind,
      (SELECT name FROM visible_user($2)) AS name`, [ws, user, date])).rows[0];
  if (!r) return null;
  const who = r.name ?? 'This person';
  if (r.kind === 'leave') return `${who} is on leave that day.`;
  if (r.kind === 'sick') return `${who} is off sick that day.`;
  if (r.kind === 'off' || r.weekly) return `${who} is off that day.`;
  return null;
}

/** The planner and assignment never use someone who is off. Checked on the server for every assignment and reschedule. */
export async function assertWorking(c: Context, assignee: string | null | undefined, scheduledFor: string | Date | null | undefined) {
  if (!assignee || !scheduledFor) return;
  const date = (await c.db.query('SELECT ($1::timestamptz AT TIME ZONE timezone)::date::text AS d FROM workspaces WHERE id=$2', [scheduledFor, c.ws])).rows[0]?.d;
  if (!date) return;
  const reason = await offReason(c.db, c.ws, assignee, date);
  if (!reason) return;
  // A free day is a working day outside approved time off. Several visits can share a day.
  // Try the week after this date and each leave end, so even long or overlapping leave
  // needs no arbitrary search limit and does not generate one row per day of leave.
  const next = (await c.db.query(`WITH anchors AS (
      SELECT $3::date AS d UNION
      SELECT ends_on FROM time_off WHERE workspace_id=$1 AND user_id=$2 AND status='approved' AND ends_on >= $3::date
    ), candidates AS (SELECT DISTINCT a.d + n AS d FROM anchors a CROSS JOIN generate_series(1,7) n)
    SELECT d::text FROM candidates
    WHERE NOT EXISTS (SELECT 1 FROM members m WHERE m.workspace_id=$1 AND m.user_id=$2 AND EXTRACT(DOW FROM d)::smallint=ANY(m.off_days))
      AND NOT EXISTS (SELECT 1 FROM time_off t WHERE t.workspace_id=$1 AND t.user_id=$2 AND t.status='approved' AND d BETWEEN t.starts_on AND t.ends_on)
    ORDER BY d LIMIT 1`, [c.ws, assignee, date])).rows[0]?.d;
  const language = (await c.db.query('SELECT language FROM user_preferences WHERE user_id=$1', [c.user])).rows[0]?.language;
  const locale = LANGUAGES.some(l => l.code === language) ? language : 'en-IN';
  const word = choiceWords(locale);
  const name = (await c.db.query('SELECT name FROM visible_user($1)', [assignee])).rows[0]?.name ?? word('Team member');
  // ICU lists Twi date words under Akan. The app language remains Twi.
  const label = new Intl.DateTimeFormat(locale === 'tw' ? 'ak' : locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${next}T00:00:00Z`));
  const message = word('{name} cannot take a job that day. His next free day is {day}.').replace(/\{(name|day)\}/g, (_, key) => key === 'name' ? name : label);
  throw invalid(message, 'assignee_id');
}

async function worker(c: Context, id: string) {
  const m = (await c.db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2', [c.ws, id])).rows[0];
  if (!m || m.role === 'client') throw new ApiError(404, 'not_found', 'This person is not on your team.');
  if (c.role === 'staff' && m.role === 'admin') throw new ApiError(403, 'forbidden', 'Ask an admin to change this person.');
  return m;
}

/** Office sees everyone's time off from today on; a technician sees his own. */
export async function listTimeOff(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    const rows = (await c.db.query(
      `SELECT t.id, t.user_id, u.name, t.kind, t.status, t.starts_on::text, t.ends_on::text, t.note FROM time_off t LEFT JOIN LATERAL visible_user(t.user_id) u ON true
       WHERE t.workspace_id=$1 AND t.status<>'declined' AND t.ends_on >= (now() AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date ORDER BY t.starts_on, u.name`, [ws])).rows;
    const off = (await withSystem(db => db.query("SELECT user_id, off_days FROM members WHERE workspace_id=$1 AND role<>'client'" + (c.role === 'technician' ? ' AND user_id=$2' : ''), c.role === 'technician' ? [ws, user] : [ws]), user)).rows;
    return { time_off: rows, off_days: Object.fromEntries(off.map(r => [r.user_id, r.off_days])) };
  });
}

export async function addTimeOff(user: string, ws: string, body: unknown) {
  const data = addSchema.parse(body), ends = data.ends_on ?? data.starts_on;
  if (ends < data.starts_on) throw invalid('The last day is before the first day.', 'ends_on');
  return inWorkspace(user, ws, async c => {
    allowTeam(c); await worker(c, data.user_id);
    const saved = (await c.db.query('INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, user_id, kind, starts_on::text, ends_on::text, note', [ws, data.user_id, data.kind, data.starts_on, ends, data.note || null, user])).rows[0];
    // Jobs already booked on those days stay put but are listed so the office can move them.
    const clashes = (await c.db.query(`SELECT id, order_number, title FROM work_orders w WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled')
      AND (scheduled_for AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date BETWEEN $3 AND $4 ORDER BY scheduled_for`, [ws, data.user_id, data.starts_on, ends])).rows;
    // Off sick: his booked visits on those days go back to Open with no one on them, so the office picks someone. No automatic move.
    let reopened = 0;
    if (data.kind === 'sick') {
      const r = await c.db.query(`UPDATE work_orders SET assignee_id=NULL, status='open' WHERE workspace_id=$1 AND assignee_id=$2 AND status='scheduled' AND archived_at IS NULL
        AND (scheduled_for AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date BETWEEN $3 AND $4`, [ws, data.user_id, data.starts_on, ends]);
      reopened = r.rowCount ?? 0;
    }
    return { ...saved, clashes, reopened };
  });
}

export async function removeTimeOff(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    allowTeam(c);
    const r = await c.db.query('DELETE FROM time_off WHERE workspace_id=$1 AND id=$2 RETURNING id', [ws, id]);
    if (!r.rowCount) throw missing();
    return { deleted: true };
  });
}

export async function setOffDays(user: string, ws: string, workerId: string, body: unknown) {
  const days = [...new Set(offDaysSchema.parse(body).off_days)].sort();
  await inWorkspace(user, ws, async c => { allowTeam(c); await worker(c, workerId); });
  return withSystem(async db => (await db.query('UPDATE members SET off_days=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id, off_days', [ws, workerId, days])).rows[0], user);
}

const requestSchema = z.object({ kind: z.enum(['leave', 'sick', 'off']).default('off'), starts_on: day, ends_on: day.optional(), note: z.string().trim().max(200).optional() }).strict();
const nice = (d: string) => new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${d}T00:00:00Z`));
/** Plain words for a time off span, like "Day off, Thursday 15 October". */
export const spanLabel = (kind: string, from: string, to: string) => `${KIND_LABELS[kind] ?? 'Time off'}, ${from === to ? nice(from) : `${nice(from)} to ${nice(to)}`}`;

/** TEAM06: a team member asks for time off for himself. It waits as pending until an admin or supervisor decides. */
export async function requestTimeOff(user: string, ws: string, body: unknown) {
  const data = requestSchema.parse(body), ends = data.ends_on ?? data.starts_on;
  if (ends < data.starts_on) throw invalid('The last day is before the first day.', 'ends_on');
  const who = await inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    const today = (await c.db.query('SELECT (now() AT TIME ZONE timezone)::date::text AS d FROM workspaces WHERE id=$1', [ws])).rows[0].d as string;
    if (data.starts_on < today) throw invalid('Pick today or a later day.', 'starts_on');
    return String((await c.db.query('SELECT name FROM visible_user($1)', [user])).rows[0]?.name ?? 'A team member');
  });
  // The role check above is the gate; the owner connection writes because a technician only reads time off.
  return withSystem(async db => {
    const clash = (await db.query("SELECT 1 FROM time_off WHERE workspace_id=$1 AND user_id=$2 AND status<>'declined' AND starts_on<=$4 AND ends_on>=$3", [ws, user, data.starts_on, ends])).rowCount;
    if (clash) throw new ApiError(409, 'exists', 'You already asked for these days.');
    const saved = (await db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by,status) VALUES($1,$2,$3,$4,$5,$6,$2,'pending') RETURNING id, user_id, kind, status, starts_on::text, ends_on::text, note", [ws, user, data.kind, data.starts_on, ends, data.note || null])).rows[0];
    await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity_id,actor_id,actor_name,work_order_title)
      SELECT m.user_id,$1,'leave_requested',$2,$3,$4,$5 FROM members m WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.user_id<>$3 AND (m.role='admin' OR (m.role='staff' AND m.staff_kind IS NULL))`,
      [ws, saved.id, user, who, spanLabel(data.kind, data.starts_on, ends)]);
    return saved;
  }, user);
}

/** An admin or supervisor approves or declines a pending request. Approved time off counts everywhere: schedule, planner, assignment. */
/** Audit A3: jobs still booked to this person on these days. Leave over them would leave the jobs with someone who is away. */
async function bookedDuring(c: { db: { query: (q: string, v: unknown[]) => Promise<{ rows: any[] }> } }, ws: string, userId: string, start: string, end: string) {
  const rows = (await c.db.query(`SELECT w.order_number, w.title, to_char(w.scheduled_for AT TIME ZONE s.timezone, 'Dy Mon FMDD') AS day FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id
    WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND w.status IN ('scheduled','in_progress','waiting_on_parts') AND w.archived_at IS NULL
      AND (w.scheduled_for AT TIME ZONE s.timezone)::date BETWEEN $3::date AND $4::date ORDER BY w.scheduled_for LIMIT 5`, [ws, userId, start, end])).rows;
  return rows;
}
async function refuseIfBooked(c: Parameters<typeof bookedDuring>[0], ws: string, userId: string, start: string, end: string) {
  const jobs = await bookedDuring(c, ws, userId, start, end);
  if (!jobs.length) return;
  const name = String((await c.db.query('SELECT name FROM visible_user($1)', [userId])).rows[0]?.name ?? 'This person');
  const list = jobs.map(j => `Job #${j.order_number} ${j.title} (${j.day})`).join(', ');
  throw new ApiError(409, 'booked', `${name} has ${jobs.length === 1 ? 'a job' : `${jobs.length} jobs`} booked on those days: ${list}. Give ${jobs.length === 1 ? 'it' : 'them'} to someone else or move ${jobs.length === 1 ? 'it' : 'them'}, then approve.`);
}

export async function decideTimeOff(user: string, ws: string, id: string, body: unknown) {
  uuid.parse(id); const { decision } = z.object({ decision: z.enum(['approved', 'declined']) }).strict().parse(body);
  return inWorkspace(user, ws, async c => {
    allowTeam(c);
    if (decision === 'approved') { const t = (await c.db.query("SELECT user_id, starts_on::text, ends_on::text FROM time_off WHERE workspace_id=$1 AND id=$2 AND status='pending'", [ws, id])).rows[0]; if (t) await refuseIfBooked(c, ws, t.user_id, t.starts_on, t.ends_on); }
    const r = (await c.db.query("UPDATE time_off SET status=$3, decided_by=$4, decided_at=now() WHERE workspace_id=$1 AND id=$2 AND status='pending' RETURNING id, user_id, kind, status, starts_on::text, ends_on::text", [ws, id, decision, user])).rows[0];
    if (!r) { const any = (await c.db.query('SELECT status FROM time_off WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0]; if (!any) throw missing(); throw new ApiError(409, 'decided', 'This request was already decided.'); }
    return r;
  });
}

/** Requests waiting for a decision (office), or your own requests (anyone on the team). */
export async function leaveRequests(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    const team = ['admin', 'staff'].includes(c.role) && c.staff_kind !== 'office';
    const rows = (await c.db.query(`SELECT t.id, t.user_id, u.name, t.kind, t.status, t.starts_on::text, t.ends_on::text, t.note FROM time_off t LEFT JOIN LATERAL visible_user(t.user_id) u ON true
      WHERE t.workspace_id=$1 AND t.created_by=t.user_id AND t.ends_on >= (now() AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date - 30 AND ${team ? "(t.status='pending' OR t.user_id=$2)" : 't.user_id=$2'}
      ORDER BY t.starts_on LIMIT 50`, [ws, user])).rows;
    return { can_decide: team, requests: rows };
  });
}
