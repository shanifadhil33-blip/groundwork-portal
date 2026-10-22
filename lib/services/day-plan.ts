import { z } from 'zod';
import { scheduledInstant } from '../dates';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import {
  DAY_REPLIES, canPlanDay, morningPlan, planFingerprint, planSavedReply,
  watchLate, type PlanActor, type PlanJob, type PlanLine, type PlanPerson,
} from '../day-plan';
import { offReason } from './time-off';
import { sendPush } from './push';
import { uuid } from './shared';

const denied = () => new ApiError(403, 'forbidden', DAY_REPLIES.onlyPlanner);
type Actor = PlanActor & { demo: boolean; tz: string; today: string; tomorrow: string; currency: string };
type Row = {
  id: string; order_number: number; title: string; trade: string | null; area: string | null; priority: string; status: string;
  assignee_id: string | null; hour: number | null; running_late: boolean; client_id: string; created_by: string | null;
  gate_pass: string | null; access_notes: string | null; day: string | null; window_hours: number;
};

async function actorOf(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string): Promise<Actor> {
  uuid.parse(ws);
  const m = (await db.query('SELECT role,staff_kind,client_kind,client_id FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws, user])).rows[0];
  if (!m?.role) throw missing();
  const w = (await db.query(`SELECT timezone, is_demo, currency,
    (now() AT TIME ZONE timezone)::date::text AS today,
    ((now() AT TIME ZONE timezone)::date + 1)::text AS tomorrow
    FROM workspaces WHERE id=$1`, [ws])).rows[0];
  if (!w) throw missing();
  return { role: m.role, staff_kind: m.staff_kind, client_kind: m.client_kind, user, client_id: m.client_id, demo: !!w.is_demo, tz: w.timezone, today: w.today, tomorrow: w.tomorrow, currency: w.currency };
}

async function load(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string, actor: Actor) {
  const peopleRows = (await db.query(`SELECT m.user_id, u.name, m.trades, m.areas FROM members m JOIN users u ON u.id=m.user_id
    WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.role='technician' ORDER BY u.name`, [ws])).rows;
  const jobs = (await db.query(`SELECT w.id, w.order_number, w.title, w.trade, s.area, w.priority, w.status, w.assignee_id,
      CASE WHEN w.scheduled_for IS NULL THEN NULL ELSE EXTRACT(HOUR FROM w.scheduled_for AT TIME ZONE $2)::int END AS hour,
      w.running_late_at IS NOT NULL AS running_late, w.client_id, w.created_by, w.gate_pass, s.access_notes,
      CASE WHEN w.scheduled_for IS NULL THEN NULL ELSE (w.scheduled_for AT TIME ZONE $2)::date::text END AS day,
      w.window_hours
    FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
    WHERE w.workspace_id=$1 AND w.archived_at IS NULL AND w.status NOT IN ('done','cancelled')
      AND (w.status='open' OR (w.scheduled_for AT TIME ZONE $2)::date IN ($3::date,$4::date))`, [ws, actor.tz, actor.today, actor.tomorrow])).rows as Row[];
  const people: PlanPerson[] = [];
  for (const person of peopleRows) {
    const away = await offReason(db as never, ws, person.user_id, actor.today);
    const booked = jobs.filter(job => job.assignee_id === person.user_id && job.day === actor.today && job.hour != null).map(job => job.hour as number);
    people.push({ id: person.user_id, name: person.name, trades: person.trades ?? [], areas: person.areas ?? [], away, booked });
  }
  const planJobs: PlanJob[] = jobs.filter(job => job.day === actor.today || job.status === 'open').map(job => ({
    id: job.id, order: job.order_number, title: job.title, trade: job.trade, area: job.area, priority: job.priority,
    status: job.status, assignee_id: job.assignee_id, hour: job.hour, running_late: job.running_late,
  }));
  return { people, jobs, planJobs, viewer: user };
}

function pack(lines: PlanLine[], summary: string, date?: string) {
  return { lines, summary, fingerprint: (date ? `${date}|` : '') + planFingerprint(lines) };
}

/** Read the morning plan (who does which job) and late visits. Selects only. */
export async function getDayPlan(user: string, ws: string, day?: 'today' | 'tomorrow') {
  return withSystem(async db => {
    const current = await actorOf(db, user, ws);
    const actor = { ...current, today: day === 'tomorrow' ? current.tomorrow : current.today };
    const { people, jobs, planJobs } = await load(db, user, ws, actor);
    const planner = canPlanDay(actor);
    const morning = planner || actor.role === 'staff' ? morningPlan(planJobs, people) : { lines: [] as PlanLine[], summary: DAY_REPLIES.nothingToPlan };
    const watch = (planner ? planJobs : []).map(job => watchLate(job, people)).filter((line): line is PlanLine => !!line)
      .map(line => ({ ...line, fingerprint: planFingerprint([line]) }));
    const visits = planner ? jobs.filter(job => job.day === actor.today && job.status === 'scheduled').map(job => ({ id: job.id, order: job.order_number, title: job.title })) : [];
    return {
      can_plan: planner,
      demo: actor.demo && planner,
      today: actor.today,
      summary: morning.summary,
      fingerprint: pack(morning.lines, morning.summary, day ? actor.today : undefined).fingerprint,
      lines: morning.lines,
      watch,
      visits,
      people: planner ? people.map(person => ({ id: person.id, name: person.name, away: person.away })) : [],
    };
  }, user);
}

const body = z.object({
  action: z.enum(['preview', 'approve', 'confirm_gate', 'skip_gate', 'mark_late']),
  kind: z.enum(['morning', 'watch', 'urgent', 'sick']).optional(),
  fingerprint: z.string().max(12000).optional(),
  date: z.iso.date().optional(),
  job_id: uuid.optional(),
  person_id: uuid.optional(),
}).strict();

function onDate(actor: Actor, date?: string): Actor {
  if (!date) return actor;
  if (date !== actor.today && date !== actor.tomorrow) throw new ApiError(409, 'conflict', DAY_REPLIES.dayChanged);
  return { ...actor, today: date };
}

function proposal(kind: string, planJobs: PlanJob[], people: PlanPerson[], jobId?: string) {
  if (kind === 'morning') return morningPlan(planJobs, people);
  if (kind === 'watch') {
    const job = planJobs.find(row => row.id === jobId);
    const line = job ? watchLate(job, people) : null;
    const lines = line ? [line] : [];
    return { lines, summary: lines.length ? lines[0].why : DAY_REPLIES.nothingToPlan };
  }
  return { lines: [] as PlanLine[], summary: DAY_REPLIES.removed };
}

async function applyLines(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> }, ws: string, actor: Actor, kind: string, lines: PlanLine[]) {
  const day = actor.today;
  for (const line of lines) {
    if (line.kind !== 'place' || !line.assignee_id || line.hour == null) continue;
    const when = scheduledInstant(day, actor.tz, line.hour);
    if (!when) continue;
    await db.query(`UPDATE work_orders SET assignee_id=$3, scheduled_for=$4,
      status=CASE WHEN status='open' THEN 'scheduled' ELSE status END,
      running_late_at=CASE WHEN $5::bool THEN NULL ELSE running_late_at END
      WHERE workspace_id=$1 AND id=$2 AND archived_at IS NULL`, [ws, line.job_id, line.assignee_id, when, kind === 'watch']);
  }
}

/** Preview does not write. Approve writes only after the signed in planner says yes, then tells the other people. */
export async function postDayPlan(user: string, ws: string, input: unknown) {
  const d = body.parse(input);
  // Scope cut Oct 20 2026: gate pass list, urgent reshuffle and sick auto move are gone. The server refuses them; the data stays.
  if (d.action === 'confirm_gate' || d.action === 'skip_gate' || d.kind === 'urgent' || d.kind === 'sick') throw new ApiError(410, 'removed', DAY_REPLIES.removed);
  if (d.action === 'mark_late') {
    if (!d.job_id) throw new ApiError(422, 'validation', DAY_REPLIES.notDemo);
    return withSystem(async db => {
      const actor = await actorOf(db, user, ws);
      if (!actor.demo || !canPlanDay(actor)) throw new ApiError(403, 'forbidden', DAY_REPLIES.notDemo);
      const row = (await db.query(`UPDATE work_orders SET running_late_at=clock_timestamp()
        WHERE workspace_id=$1 AND id=$2 AND status IN ('scheduled','in_progress') AND archived_at IS NULL RETURNING id`, [ws, d.job_id])).rows[0];
      if (!row) throw missing();
      return { reply: DAY_REPLIES.markedLate };
    }, user);
  }
  const kind = d.kind ?? 'morning';
  const preview = await withSystem(async db => {
    const actor = onDate(await actorOf(db, user, ws), d.date);
    if (!canPlanDay(actor)) throw denied();
    const { people, planJobs } = await load(db, user, ws, actor);
    const next = proposal(kind, planJobs, people, d.job_id);
    return { actor, next: pack(next.lines, next.summary, d.date) };
  }, user);
  if (d.action === 'preview') return { ...preview.next, reply: preview.next.summary };
  if (d.fingerprint !== preview.next.fingerprint) throw new ApiError(409, 'conflict', DAY_REPLIES.dayChanged);
  const placed = preview.next.lines.filter(line => line.kind === 'place' && line.assignee_id && line.hour != null);
  if (!placed.length) return { reply: DAY_REPLIES.nothingToPlan, lines: preview.next.lines };
  let simulated = false;
  const told = await withSystem(async db => {
    const actor = onDate(await actorOf(db, user, ws), d.date);
    simulated = actor.demo;
    if (!canPlanDay(actor)) throw denied();
    const { people, planJobs } = await load(db, user, ws, actor);
    const built = proposal(kind, planJobs, people, d.job_id);
    const again = pack(built.lines, built.summary, d.date);
    if (again.fingerprint !== d.fingerprint) throw new ApiError(409, 'conflict', DAY_REPLIES.dayChanged);
    await applyLines(db, ws, actor, kind, again.lines);
    const notes: { who: string; body: string; job: string; title: string }[] = [];
    const note = kind === 'morning' ? DAY_REPLIES.dayReady : DAY_REPLIES.jobChanged;
    for (const line of again.lines) {
      if (line.kind !== 'place' || !line.assignee_id || line.assignee_id === user) continue;
      notes.push({ who: line.assignee_id, body: note, job: line.job_id, title: line.title });
    }
    for (const note of notes) {
      await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,work_order_title,job_step_body)
        VALUES($1,$2,'day_plan','work_orders',$3,$4,$5,$6)`, [note.who, ws, note.job, user, note.title, note.body]);
    }
    return [...new Set(notes.map(note => note.who))];
  }, user);
  const pushCount = told.length ? await sendPush(told, { title: 'Your day', body: DAY_REPLIES.dayReady, url: '/today', tag: `dayplan-${ws}` }) : 0;
  return { reply: simulated ? 'The plan is saved. Notifications are simulated. Each person can see his day in the app.' : planSavedReply(pushCount), saved: true };
}
