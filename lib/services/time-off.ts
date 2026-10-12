import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError, invalid, missing } from '../http';
import { allow, inWorkspace, uuid, type Context } from './shared';

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const KIND_LABELS: Record<string, string> = { leave: 'On leave', sick: 'Sick', off: 'Day off' };
const day = z.iso.date();
const addSchema = z.object({ user_id: uuid, kind: z.enum(['leave', 'sick', 'off']), starts_on: day, ends_on: day.optional(), note: z.string().trim().max(200).optional() }).strict();
const offDaysSchema = z.object({ off_days: z.array(z.number().int().min(0).max(6)).max(6) }).strict();

/** Why a person can't take work on a day, or null when he is free. Weekly off days and leave both count. */
export async function offReason(db: PoolClient, ws: string, user: string, date: string) {
  const r = (await db.query(
    `SELECT (SELECT EXTRACT(DOW FROM $3::date)::smallint = ANY(m.off_days) FROM members m WHERE m.workspace_id=$1 AND m.user_id=$2) AS weekly,
      (SELECT kind FROM time_off t WHERE t.workspace_id=$1 AND t.user_id=$2 AND $3::date BETWEEN t.starts_on AND t.ends_on ORDER BY created_at DESC LIMIT 1) AS kind,
      (SELECT name FROM users WHERE id=$2) AS name`, [ws, user, date])).rows[0];
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
  const reason = await withSystem(db => offReason(db, c.ws, assignee, date), c.user);
  if (reason) throw invalid(`${reason} Choose someone else or another day.`, 'assignee_id');
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
      `SELECT t.id, t.user_id, u.name, t.kind, t.starts_on::text, t.ends_on::text, t.note FROM time_off t LEFT JOIN users u ON u.id=t.user_id
       WHERE t.workspace_id=$1 AND t.ends_on >= (now() AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date ORDER BY t.starts_on, u.name`, [ws])).rows;
    const off = (await withSystem(db => db.query("SELECT user_id, off_days FROM members WHERE workspace_id=$1 AND role<>'client'" + (c.role === 'technician' ? ' AND user_id=$2' : ''), c.role === 'technician' ? [ws, user] : [ws]), user)).rows;
    return { time_off: rows, off_days: Object.fromEntries(off.map(r => [r.user_id, r.off_days])) };
  });
}

export async function addTimeOff(user: string, ws: string, body: unknown) {
  const data = addSchema.parse(body), ends = data.ends_on ?? data.starts_on;
  if (ends < data.starts_on) throw invalid('The last day is before the first day.', 'ends_on');
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']); await worker(c, data.user_id);
    const saved = (await c.db.query('INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note,created_by) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id, user_id, kind, starts_on::text, ends_on::text, note', [ws, data.user_id, data.kind, data.starts_on, ends, data.note || null, user])).rows[0];
    // Jobs already booked on those days stay put but are listed so the office can move them.
    const clashes = (await c.db.query(`SELECT id, order_number, title FROM work_orders w WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled')
      AND (scheduled_for AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date BETWEEN $3 AND $4 ORDER BY scheduled_for`, [ws, data.user_id, data.starts_on, ends])).rows;
    return { ...saved, clashes };
  });
}

export async function removeTimeOff(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const r = await c.db.query('DELETE FROM time_off WHERE workspace_id=$1 AND id=$2 RETURNING id', [ws, id]);
    if (!r.rowCount) throw missing();
    return { deleted: true };
  });
}

export async function setOffDays(user: string, ws: string, workerId: string, body: unknown) {
  const days = [...new Set(offDaysSchema.parse(body).off_days)].sort();
  await inWorkspace(user, ws, async c => { allow(c, ['admin', 'staff']); await worker(c, workerId); });
  return withSystem(async db => (await db.query('UPDATE members SET off_days=$3 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id, off_days', [ws, workerId, days])).rows[0], user);
}
