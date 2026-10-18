import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { withSystem } from '../db';
import { allow, allowClientAnswer, inWorkspace, isOfficeStaff, uuid, type Context } from './shared';
import { getWorkOrder } from './work-orders';

/** The office sends a price for a job. The client approves or declines it. Amounts only ever come from the office. */
const quoteSchema = z.object({ amount: z.number().min(0).max(10000000), note: z.string().trim().max(1000).optional() }).strict();
const decideSchema = z.object({ decision: z.enum(['approved', 'declined']) }).strict();

async function notifyOffice(db: { query: (q: string, v: unknown[]) => Promise<unknown> }, ws: string, id: string, actor: string, name: string, title: string, kind: string, to: string | null) {
  await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,to_status)
    SELECT m.user_id,$1,$5,'work_orders',$2,$3,$4,$6,$7 FROM members m WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.role IN ('admin','staff') AND m.user_id<>$3`, [ws, id, actor, name, kind, title, to]);
}
const who = async (c: Context) => String((await c.db.query('SELECT name FROM visible_user($1)', [c.user])).rows[0]?.name ?? 'Someone');

export async function sendQuote(user: string, ws: string, id: string, body: unknown) {
  uuid.parse(id); const data = quoteSchema.parse(body);
  const o: any = await getWorkOrder(user, ws, id);
  const name = await inWorkspace(user, ws, async c => { allow(c, ['admin', 'staff']); return who(c); });
  if (o.status === 'done' || o.status === 'cancelled') throw invalid('This job is closed.', 'amount');
  return withSystem(async db => {
    const r = (await db.query("UPDATE work_orders SET quote_amount=$3, quote_note=$4, quote_status='pending', quote_decided_by=NULL, quote_decided_at=NULL WHERE workspace_id=$1 AND id=$2 RETURNING id, quote_amount, quote_note, quote_status", [ws, id, data.amount, data.note || null])).rows[0];
    // Every client person who can see this job hears about it; a household only for his own request.
    await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
      SELECT m.user_id,$1,'quote_sent','work_orders',$2,$3,$4,$5 FROM members m WHERE m.workspace_id=$1 AND m.role='client' AND m.client_id=$6 AND m.archived_at IS NULL AND (coalesce(m.client_kind,'manager')='manager' OR m.user_id=$7::uuid) AND $7::uuid IS NOT NULL`,
      [ws, id, user, name, o.title, o.client_id, o.created_by]);
    return r;
  }, user);
}

/** The client approves or declines the price. Only a client who can see the job; the job must have a waiting quote. */
export async function decideQuote(user: string, ws: string, id: string, body: unknown) {
  uuid.parse(id); const { decision } = decideSchema.parse(body);
  const o: any = await getWorkOrder(user, ws, id);
  const name = await inWorkspace(user, ws, async c => { allowClientAnswer(c, o); return who(c); });
  if (o.quote_status !== 'pending') throw new ApiError(409, 'no_quote', o.quote_status ? 'This price was already answered.' : 'There is no price to approve on this job yet.');
  return withSystem(async db => {
    const r = (await db.query("UPDATE work_orders SET quote_status=$3, quote_decided_by=$4, quote_decided_at=now() WHERE workspace_id=$1 AND id=$2 AND quote_status='pending' RETURNING id, quote_amount, quote_status", [ws, id, decision, user])).rows[0];
    if (!r) throw new ApiError(409, 'no_quote', 'This price was already answered.');
    await notifyOffice(db, ws, id, user, name, o.title, 'quote_decided', decision);
    // Audit P7b: the technician on the job hears about a declined price before he goes.
    if (decision === 'declined' && o.assignee_id) await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,to_status)
      SELECT m.user_id,$1,'quote_decided','work_orders',$2,$3,$4,$5,'declined' FROM members m WHERE m.workspace_id=$1 AND m.user_id=$6 AND m.role='technician' AND m.archived_at IS NULL`, [ws, id, user, name, o.title, o.assignee_id]);
    return r;
  }, user);
}

/** The client confirms the visit time the office booked. A new time needs a new confirmation. */
export async function confirmVisit(user: string, ws: string, id: string) {
  uuid.parse(id);
  const o: any = await getWorkOrder(user, ws, id);
  const name = await inWorkspace(user, ws, async c => { allowClientAnswer(c, o); return who(c); });
  if (!o.scheduled_for) throw invalid('This job has no visit time yet.', 'scheduled_for');
  if (o.status === 'done' || o.status === 'cancelled') throw invalid('This job is closed.', 'scheduled_for');
  return withSystem(async db => {
    const r = (await db.query('UPDATE work_orders SET visit_confirmed_for=scheduled_for, visit_confirmed_by=$3 WHERE workspace_id=$1 AND id=$2 RETURNING id, scheduled_for, visit_confirmed_for', [ws, id, user])).rows[0];
    await notifyOffice(db, ws, id, user, name, o.title, 'visit_confirmed', null);
    return r;
  }, user);
}
export { isOfficeStaff };
