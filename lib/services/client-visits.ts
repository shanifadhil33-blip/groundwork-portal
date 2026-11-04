import { pushClientUpdate } from './push';
import { visibleTenant } from './tenant';
import { z } from 'zod';
import { asAgent, withSystem } from '../db';
import { ApiError, invalid, missing } from '../http';
import { allow, inWorkspace, row, uuid, type Context } from './shared';
import { assertWorking } from './time-off';

export const slotInput = z.object({ id: uuid, day: z.iso.date().optional(), time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).optional(), period: z.enum(['morning', 'afternoon', 'any']).default('any') }).strict();
export const changeInput = z.object({ id: uuid, scheduled_for: z.iso.datetime({ offset: true }).optional(), updated_at: z.iso.datetime({ offset: true }) }).strict();
export const canCancelVisit = (job: { status: string; on_way_at?: unknown; started?: boolean }) => ['open', 'scheduled'].includes(job.status) && !job.on_way_at && !job.started;
async function own(c: Context, id: string) {
  const job = await row(c, 'work_orders', id);
  allow(c, ['client']);
  if (job.client_id !== c.client_id || job.created_by !== c.user || job.archived_at) throw missing();
  job.started = await hasStarted(c, id);
  return job;
}
async function hasStarted(c: Context, id: string) {
  return !!(await c.db.query("SELECT 1 FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2 AND kind='status_changed' AND details->>'to_status'='in_progress' LIMIT 1", [c.ws, id])).rowCount;
}
export async function previousTechnician(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['client']);
    return (await c.db.query(`SELECT w.assignee_id AS user_id,a.name FROM work_orders w
      LEFT JOIN LATERAL visible_assignee(w.workspace_id,w.id) a ON true
      WHERE w.workspace_id=$1 AND w.client_id=$2 AND w.created_by=$3 AND w.status='done'
      AND w.assignee_id IS NOT NULL AND w.archived_at IS NULL ORDER BY w.updated_at DESC,w.id LIMIT 1`, [ws, c.client_id, user])).rows[0] ?? null;
  });
}
/** Jobs have no duration field. Reserve one hour per visit, including partial overlaps. */
export async function assertFreeVisit(c: Context, job: Record<string, any>, at: string) {
  if (!job.assignee_id) throw invalid('The office needs to assign a technician first.');
  await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [c.ws + job.assignee_id]);
  await assertWorking(c, job.assignee_id, at);
  const ok = (await c.db.query(`SELECT $1::timestamptz > now() AND
    EXTRACT(DOW FROM $1::timestamptz AT TIME ZONE timezone)::int=ANY(working_days) AND
    ($1::timestamptz AT TIME ZONE timezone)::time >= (working_hours->>'start')::time AND
    (($1::timestamptz + interval '1 hour') AT TIME ZONE timezone)::date=($1::timestamptz AT TIME ZONE timezone)::date AND
    (($1::timestamptz + interval '1 hour') AT TIME ZONE timezone)::time <= (working_hours->>'end')::time AS ok
    FROM workspaces WHERE id=$2`, [at, c.ws])).rows[0]?.ok;
  if (!ok) throw invalid('Choose a future visit inside company working hours.');
  await assertNoVisitClash(c, job, at);
}
export async function assertNoVisitClash(c: Context, job: Record<string, any>, at: string | Date | null | undefined) {
  if (!job.assignee_id || !at) return;
  await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [c.ws + job.assignee_id]);
  const clash = (await c.db.query(`SELECT 1 FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND id IS DISTINCT FROM $3
    AND archived_at IS NULL AND status NOT IN ('done','cancelled')
    AND scheduled_for < $4::timestamptz + interval '1 hour' AND scheduled_for + interval '1 hour' > $4::timestamptz`, [c.ws, job.assignee_id, job.id, at])).rowCount;
  if (clash) throw invalid('This visit time is no longer free. Choose another time.');
}
export async function freeVisitSlots(user: string, ws: string, input: unknown) {
  const d = slotInput.parse(input);
  const job = await inWorkspace(user, ws, c => own(c, d.id));
  if (job.status !== 'scheduled' || !canCancelVisit(job)) throw invalid('Ask the supervisor to change this visit.');
  return withSystem(async db => {
    const c: Context = { db, ws, user, role: 'client', client_id: job.client_id };
    return slotsForJob(c, job, d);
  }, user);
}
/** HOME07 slot engine shared by return visits. Call only after checking who can book this job. */
export async function slotsForJob(c: Context, job: Record<string, any>, d: {day?:string;time?:string;period:string} = {period:'any'}) {
    const db=c.db, ws=c.ws;
    const candidates = (await db.query(`WITH settings AS (SELECT *,coalesce($2::date,(now() AT TIME ZONE timezone)::date) AS day FROM workspaces WHERE id=$1),
      candidates AS (SELECT ((day + n + (working_hours->>'start')::time) AT TIME ZONE timezone) + minutes * interval '30 minutes' AS at, timezone FROM settings CROSS JOIN generate_series(0,13) n CROSS JOIN LATERAL generate_series(0,greatest(0,floor(extract(epoch FROM ((working_hours->>'end')::time - (working_hours->>'start')::time))/1800)::int - 2)) minutes
      UNION SELECT (day + $3::time) AT TIME ZONE timezone,timezone FROM settings WHERE $3::time IS NOT NULL)
      SELECT DISTINCT at FROM candidates WHERE at>now() AND ($4='any' OR ($4='morning' AND EXTRACT(HOUR FROM at AT TIME ZONE timezone)<12) OR ($4='afternoon' AND EXTRACT(HOUR FROM at AT TIME ZONE timezone)>=12))
      ORDER BY at LIMIT 700`, [c.ws, d.day ?? null, d.time ?? null, d.period])).rows;
    const exact = d.day && d.time ? (await db.query('SELECT ($1::date + $2::time) AT TIME ZONE timezone AS at FROM workspaces WHERE id=$3', [d.day, d.time, ws])).rows[0]?.at : null;
    const ordered = exact ? [{ at: exact }, ...candidates.filter(r => new Date(r.at).getTime() !== new Date(exact).getTime())] : candidates;
    const slots: string[] = [];
    for (const r of ordered) {
      const at = new Date(r.at).toISOString();
      if (slots.includes(at)) continue;
      try { await assertFreeVisit(c, job, at); slots.push(at); if (slots.length === 3 || exact && at === new Date(exact).toISOString()) break; }
      catch (e) { if (!(e instanceof ApiError && e.status === 422)) throw e; }
    }
    return { id: job.id, updated_at: new Date(job.updated_at).toISOString(), slots, timezone: (await db.query('SELECT timezone FROM workspaces WHERE id=$1', [c.ws])).rows[0].timezone };
}
async function notice(c: Context, job: Record<string, any>, kind: string, supervisorOnly = false) {
  await c.db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
    SELECT m.user_id,$1,$4,'work_orders',$2,$3,(SELECT name FROM users WHERE id=$3),$5 FROM members m
    WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.user_id<>$3 AND
    (m.role='admin' OR m.role='staff' AND coalesce(m.staff_kind,'')<>'office' OR (NOT $7::boolean AND m.user_id=$6))`, [c.ws, job.id, c.user, kind, job.title, job.assignee_id, supervisorOnly]);
}
/** Revalidate membership and ownership inside the privileged write transaction. */
async function clientTransaction<T>(user: string, ws: string, id: string, fn: (c: Context, job: any) => Promise<T>) {
  await inWorkspace(user, ws, c => own(c, id));
  return asAgent({ kind: 'assistant' }, () => withSystem(async db => {
    const m = (await db.query("SELECT client_id,client_kind FROM members WHERE workspace_id=$1 AND user_id=$2 AND role='client' AND archived_at IS NULL", [ws, user])).rows[0];
    if (!m) throw missing();
    const c: Context = { db, ws, user, role: 'client', client_kind:m.client_kind,client_id: m.client_id };
    const job = await row(c, 'work_orders', id, true);
    if (job.created_by !== user || job.client_id !== m.client_id || job.archived_at) throw missing();
    job.started = await hasStarted(c, id);
    return fn(c, job);
  }, user));
}
export async function prepareClientVisit(user: string, ws: string, tool: 'reschedule_visit' | 'cancel_visit', input: unknown) {
  const d = changeInput.parse(input);
  return clientTransaction(user, ws, d.id, async (c, job) => {
    if (tool === 'cancel_visit' && !canCancelVisit(job)) {
      if (['done', 'cancelled'].includes(job.status)) throw invalid('This job is already closed.');
      await notice(c, job, 'client_callback', true);
      const who = String((await c.db.query('SELECT name FROM users WHERE id=$1', [job.assignee_id])).rows[0]?.name ?? 'The technician').split(/\s+/)[0];
      return { available: true, reply: `${who} is already on the way. I asked the supervisor to call you.` };
    }
    await validateChange(c, job, tool, d);
    const summary = tool === 'cancel_visit' ? `Cancel WO ${job.order_number} ${job.title}?` : `Move WO ${job.order_number} ${job.title} to ${new Intl.DateTimeFormat('en', { dateStyle: 'full', timeStyle: 'short', timeZone: (await c.db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0].timezone }).format(new Date(d.scheduled_for!))}?`;
    const a = (await c.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id', [ws, user, tool, JSON.stringify(d), summary, 'You asked Agent to change your visit. The technician and supervisors will be notified.', JSON.stringify(job)])).rows[0];
    return { available: true, pending_action: { id: a.id, tool, args: d, summary, why: 'Nothing changes until you say yes.' } };
  });
}
async function validateChange(c: Context, job: any, tool: string, d: z.infer<typeof changeInput>) {
  if (new Date(job.updated_at).getTime() !== new Date(d.updated_at).getTime()) throw new ApiError(409, 'stale', 'This job changed. Ask Agent again.');
  if (!canCancelVisit(job)) throw invalid('Ask the supervisor to change this visit.');
  if (tool === 'reschedule_visit') {
    if (job.status !== 'scheduled' || !d.scheduled_for) throw invalid('Choose a time for a scheduled job.');
    await assertFreeVisit(c, job, d.scheduled_for);
  }
}
export async function changeClientVisit(user: string, ws: string, tool: 'reschedule_visit' | 'cancel_visit', input: unknown) {
  const d = changeInput.parse(input);
  let changed=false;
  const result=await clientTransaction(user, ws, d.id, async (c, job) => {
    if (tool === 'cancel_visit' && !canCancelVisit(job) && !['done', 'cancelled'].includes(job.status)) {
      await notice(c, job, 'client_callback', true);
      const who = String((await c.db.query('SELECT name FROM users WHERE id=$1', [job.assignee_id])).rows[0]?.name ?? 'The technician').split(/\s+/)[0];
      return { reply: `${who} is already on the way. I asked the supervisor to call you.`, refused: true };
    }
    await validateChange(c, job, tool, d);
    const saved = tool === 'cancel_visit'
      ? (await c.db.query("UPDATE work_orders SET status='cancelled' WHERE workspace_id=$1 AND id=$2 RETURNING *", [ws, d.id])).rows[0]
      : (await c.db.query('UPDATE work_orders SET scheduled_for=$3,visit_confirmed_for=NULL WHERE workspace_id=$1 AND id=$2 RETURNING *', [ws, d.id, d.scheduled_for])).rows[0];
    await notice(c, job, tool === 'cancel_visit' ? 'job_cancelled' : 'visit_changed');
    changed=true;
    return visibleTenant(c,saved);
  });
  if(changed)await pushClientUpdate(user,result as any,tool==='cancel_visit'?'job_cancelled':'visit_changed');
  return result;
}

/** Keep the tap choices on the server so the next turn never has to guess a time or job. */
export async function visitSlotChoices(user: string, ws: string, result: { id: string; updated_at: string; slots: string[]; timezone: string }) {
  return inWorkspace(user, ws, async c => {
    const job = await own(c, result.id);
    const choices: string[] = [];
    for (const at of result.slots) {
      const label = new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: result.timezone }).format(new Date(at));
      await c.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why) VALUES($1,$2,$3,$4,$5,$6)', [ws, user, 'reschedule_visit', JSON.stringify({ id: result.id, updated_at: result.updated_at, scheduled_for: at }), label, 'Visit time choice']);
      choices.push(label);
    }
    return { available: true, reply: choices.length ? `Choose a free visit time for WO ${job.order_number} ${job.title}.` : 'There are no free visits in this period. Try another day.', choices };
  });
}
export async function selectedVisitChoice(user: string, ws: string, text: string) {
  const args = await inWorkspace(user, ws, async c => {
    if (c.role !== 'client') return null;
    return (await c.db.query("SELECT args FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='reschedule_visit' AND why='Visit time choice' AND summary=$3 AND consumed_at IS NULL AND declined_at IS NULL AND expires_at>now() ORDER BY created_at DESC,id DESC LIMIT 1", [ws, user, text])).rows[0]?.args ?? null;
  });
  return args ? prepareClientVisit(user, ws, 'reschedule_visit', args) : null;
}
