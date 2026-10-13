import { restoreJob } from './job-records';
import { withSystem,withUser } from '../db';
import { ApiError, missing } from '../http';
import { allow, inWorkspace, uuid } from './shared';
import { patchWorkOrder } from './work-orders';
import { setJobPayment } from './payments';
import { patchClient, patchSite } from './clients';

/** Job fields an agent action may change, saved before it runs so Undo can put them back. */
const JOB_FIELDS = ['status', 'assignee_id', 'scheduled_for', 'due_on', 'priority', 'trade', 'payment_status'] as const;
export const UNDOABLE = ['assign_work_order', 'set_job_trade', 'set_priority', 'update_work_order_dates', 'update_work_order_status', 'create_request', 'set_job_payment', 'add_comment', 'update_client', 'update_site'];
const RECORD_TOOLS = ['update_client', 'update_site'];
/** The client or site fields an edit will change, as they are now, so Undo can put them back. Blank means it was empty. */
export function recordSnapshot(tool: string, args: Record<string, any>, record: Record<string, any> | null) {
  if (!record || !RECORD_TOOLS.includes(tool)) return null;
  const fields = Object.fromEntries(Object.keys(args).filter(k => k !== 'id' && k !== 'updated_at').map(k => {
    const v = record[k]; return [k, v instanceof Date ? v.toISOString().slice(0, 10) : v ?? (k === 'contract_visits' ? null : '')];
  }));
  return { id: record.id, record: tool === 'update_client' ? 'client' : 'site', fields };
}
/** One plain line: what the person asked, then what the change does. Built by the server, never by the model. */
export function whyNote(ask: string, effects: string[]) {
  const said = ask.replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
  const quote = said.length > 140 ? `${said.slice(0, 137).trim()}...` : said;
  const does = effects.map(e => e.replace(/\s+/g, ' ').trim().replace(/[.:]+$/, '')).filter(Boolean).join('. ').replace(/:\./g, '.');
  return `${quote ? `You said "${quote}". ` : ''}${does ? `${does}.` : ''}`.slice(0, 400);
}
export function jobSnapshot(order: Record<string, any> | null) {
  if (!order) return null;
  return { id: order.id, ...Object.fromEntries(JOB_FIELDS.map(k => [k, order[k] instanceof Date ? order[k].toISOString() : order[k] ?? null])) };
}

/** Each person reads only what his own Agent did. Company approval proposals live separately. */
export async function listDecisions(user: string, ws: string) {
 return inWorkspace(user,ws,async c=>(await c.db.query(
  `SELECT a.id,a.tool,a.summary,a.why,a.consumed_at,a.undone_at,a.outcome,u.name AS by_name,x.name AS undone_by_name,
    (a.undone_at IS NULL AND a.outcome='done' AND a.before->>'id' IS NOT NULL AND a.tool=ANY($2)) AS can_undo
   FROM assistant_actions a LEFT JOIN LATERAL visible_user(a.user_id) u ON true LEFT JOIN LATERAL visible_user(a.undone_by) x ON true
   WHERE a.workspace_id=$1 AND a.user_id=$3 AND a.consumed_at IS NOT NULL ORDER BY a.consumed_at DESC LIMIT 20`,[ws,UNDOABLE,user])).rows
   .map(r=>({...r,can_undo:r.can_undo&&['admin','staff'].includes(c.role)&&((r.tool!=='set_job_payment'&&!RECORD_TOOLS.includes(r.tool))||c.role==='admin')})));
}

/** Undo puts the job back as it was. Same permission checks as doing it by hand, then the log records who undid it. */
export async function undoDecision(user: string, ws: string, id: string) {
  uuid.parse(id);
  await inWorkspace(user, ws, async c => allow(c, ['admin', 'staff']));
  const a = await withUser(user,async db => (await db.query('SELECT * FROM assistant_actions WHERE workspace_id=$1 AND id=$2 AND user_id=$3 AND consumed_at IS NOT NULL', [ws, id,user])).rows[0]);
  if (!a) throw missing();
  if (a.undone_at) throw new ApiError(409, 'undone', 'This was already undone.');
  if (a.outcome !== 'done' || !UNDOABLE.includes(a.tool) || !a.before?.id) throw new ApiError(422, 'invalid', 'This one can not be undone here.');
  const b = a.before as Record<string, any>;
  const job = !RECORD_TOOLS.includes(a.tool);
  const now = job ? await inWorkspace(user, ws, async c => (await c.db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2', [ws, b.id])).rows[0]) : null;
  if (job && !now) throw missing();
  const version = now?.updated_at.toISOString();
  try {
    if (a.tool === 'add_comment') {
      if (!b.comment_id) throw new ApiError(422, 'invalid', 'This note can not be found.');
      const gone = await inWorkspace(user, ws, async c => (await c.db.query('DELETE FROM comments WHERE workspace_id=$1 AND id=$2 RETURNING id', [ws, b.comment_id])).rows[0]);
      if (!gone) throw new ApiError(422, 'invalid', 'This note was already removed.');
    } else if (RECORD_TOOLS.includes(a.tool)) {
      await (a.tool === 'update_client' ? patchClient : patchSite)(user, ws, b.id, b.fields);
    } else if (a.tool === 'create_request') {
      if (now.status === 'cancelled') throw new ApiError(409, 'undone', 'This job is already cancelled.');
      await patchWorkOrder(user, ws, b.id, { status: 'cancelled', updated_at: version });
    } else if (a.tool === 'set_job_payment') {
      await setJobPayment(user, ws, b.id, { payment_status: b.payment_status ?? 'to_bill' });
    } else {
      const fields: Record<string, unknown> = {};
      if (a.tool === 'assign_work_order') fields.assignee_id = b.assignee_id;
      if (a.tool === 'set_job_trade') fields.trade = b.trade;
      if (a.tool === 'set_priority') fields.priority = b.priority;
      if (a.tool === 'update_work_order_dates') { fields.scheduled_for = b.scheduled_for; fields.due_on = b.due_on; }
      if (a.tool === 'update_work_order_status') fields.status = b.status;
      // A cancel is undone by Restore, since cancelled is final for a normal status change.
      if (a.tool === 'update_work_order_status' && now.status === 'cancelled') await restoreJob(user, ws, b.id, { status: b.status });
      else await patchWorkOrder(user, ws, b.id, { ...fields, updated_at: version });
    }
  } catch (e) {
    if (e instanceof ApiError && e.status === 403) throw e;
    throw new ApiError(422, 'invalid', `This can not be undone now. ${e instanceof ApiError ? e.message : 'The job changed since then.'} Open the job to change it by hand.`);
  }
  await withSystem(db => db.query('UPDATE assistant_actions SET undone_at=now(), undone_by=$3 WHERE workspace_id=$1 AND id=$2', [ws, id, user]), user);
  return { undone: true };
}
