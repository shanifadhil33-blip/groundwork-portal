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
  return `${quote ? `You said "${quote}". ` : ''}${does ? (/[.?!]$/.test(does) ? does : `${does}.`) : ''}`.slice(0, 400);
}
export function jobSnapshot(order: Record<string, any> | null) {
  if (!order) return null;
  return { id: order.id, ...Object.fromEntries(JOB_FIELDS.map(k => [k, order[k] instanceof Date ? order[k].toISOString() : order[k] ?? null])) };
}

/** One field that a confirmed change moved: what it was and what it is now. */
export type Change = { field: string; from: string | null; to: string | null };
/** Compares the saved before and after so the log can show exactly what moved. Only fields that changed. */
export function changeList(before: Record<string, any> | null, after: Record<string, any> | null): Change[] {
  if (!before || !after) return [];
  const b = before.fields ?? before, a = after.fields ?? after;
  const norm = (v: unknown) => v === undefined || v === null || v === '' ? null : String(v);
  return Object.keys(a).filter(k => k !== 'id' && k !== 'comment_id' && norm(b[k]) !== norm(a[k])).map(k => ({ field: k, from: norm(b[k]), to: norm(a[k]) }));
}
const LOGGED = "(a.consumed_at IS NOT NULL OR a.outcome IN ('declined','refused'))";
/** Each person reads only what his own Agent did: done, failed, said no and not allowed, newest first. Company approval proposals live separately. */
export async function listDecisions(user: string, ws: string, limit = 20) {
 const n = Math.max(1, Math.min(100, Math.floor(Number(limit)) || 20));
 return inWorkspace(user,ws,async c=>{
  const rows=(await c.db.query(
  `SELECT a.id,a.tool,a.summary,a.why,a.reason,a.outcome,coalesce(a.consumed_at,a.declined_at) AS at,a.consumed_at,a.undone_at,a.before,a.after,u.name AS by_name,x.name AS undone_by_name,
    (a.undone_at IS NULL AND a.outcome='done' AND a.before->>'id' IS NOT NULL AND a.tool=ANY($2)) AS can_undo
   FROM assistant_actions a LEFT JOIN LATERAL visible_user(a.user_id) u ON true LEFT JOIN LATERAL visible_user(a.undone_by) x ON true
   WHERE a.workspace_id=$1 AND a.user_id=$3 AND ${LOGGED} ORDER BY coalesce(a.consumed_at,a.declined_at) DESC LIMIT $4`,[ws,UNDOABLE,user,n])).rows;
  // A person in the change is shown by the name this workspace can see, never by an id.
  const people=new Map<string,string>();
  for(const r of rows)for(const k of ['before','after'])if(r[k]?.assignee_id&&!people.has(r[k].assignee_id))people.set(r[k].assignee_id,String((await c.db.query('SELECT name FROM visible_user($1)',[r[k].assignee_id])).rows[0]?.name??'Team member'));
  return rows.map(({before,after,...r})=>({...r,
   changes:r.outcome==='done'?changeList(before,after).map(ch=>ch.field==='assignee_id'?{field:'assignee',from:ch.from?people.get(ch.from)??null:null,to:ch.to?people.get(ch.to)??null:null}:ch):[],
   can_undo:r.can_undo&&['admin','staff'].includes(c.role)&&((r.tool!=='set_job_payment'&&!RECORD_TOOLS.includes(r.tool))||c.role==='admin')}));
 });
}

/** The person tapped Change on a card: nothing happens, and the log keeps that he said no and when. */
export async function declineDecision(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    const a = (await c.db.query('SELECT consumed_at,declined_at,outcome FROM assistant_actions WHERE workspace_id=$1 AND id=$2 AND user_id=$3 FOR UPDATE', [ws, id, user])).rows[0];
    if (!a) throw missing();
    if (a.consumed_at) throw new ApiError(409, 'consumed', 'This action has already been confirmed.');
    if (a.declined_at) return { declined: true };
    await c.db.query("UPDATE assistant_actions SET declined_at=now(), decided_by=$3, outcome='declined', reason='You said no on the card. Nothing was changed.' WHERE workspace_id=$1 AND id=$2", [ws, id, user]);
    return { declined: true };
  });
}

/** Plain reasons for the log when a role may not make a change. The Agent gets its own wording to explain it. */
export const REFUSAL_REASON = {
  technician: 'Technicians change the status of their own jobs and add notes. A supervisor makes other changes.',
  team: 'Only admins and supervisors assign jobs or change the team.',
  admin: 'Only an admin can make this change.',
  records: 'Only an admin adds or changes clients and sites.',
} as const;
/** A change the Agent was not allowed to make is saved too, so the log shows what was asked and why it did not happen. */
export async function logRefusal(user: string, ws: string, entry: { tool: string; args: unknown; summary: string; why: string; reason: string }) {
  await inWorkspace(user, ws, c => c.db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,reason,declined_at,outcome) VALUES($1,$2,$3,$4,$5,$6,$7,now(),'refused')",
    [ws, user, entry.tool, JSON.stringify(entry.args ?? {}), entry.summary.slice(0, 600), entry.why.slice(0, 400), entry.reason.slice(0, 400)]));
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
