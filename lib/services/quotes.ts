import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { withSystem } from '../db';
import { allow, allowClientAnswer, inWorkspace, isOfficeStaff, uuid, type Context, replay } from './shared';
import { ownerCan } from './owner';
import { priceChangeOn, priceEvent, priceNotice } from './price-changes';
import { getWorkOrder } from './work-orders';

/** The office sends a price for a job. The client approves or declines it. Amounts only ever come from the office. */
const quoteSchema = z.object({ amount: z.number().min(0).max(10000000).multipleOf(0.01), note: z.string().trim().max(1000).optional() }).strict();
const decideSchema = z.object({ decision: z.enum(['approved', 'declined']), amount:z.number().min(0).max(10000000).multipleOf(0.01).optional() }).strict();

async function notifyOffice(db: { query: (q: string, v: unknown[]) => Promise<unknown> }, ws: string, id: string, actor: string, name: string, title: string, kind: string, to: string | null) {
  await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,to_status)
    SELECT m.user_id,$1,$5,'work_orders',$2,$3,$4,$6,$7 FROM members m WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.role IN ('admin','staff') AND m.user_id<>$3`, [ws, id, actor, name, kind, title, to]);
}
const who = async (c: Context) => String((await c.db.query('SELECT name FROM visible_user($1)', [c.user])).rows[0]?.name ?? 'Someone');

export const PRICE_PERMISSION = 'Only the owner or an admin allowed to handle money can set prices.';
async function quoteContext(db: import('pg').PoolClient,user:string,ws:string,id:string) {
  uuid.parse(ws);uuid.parse(id);
  const m=(await db.query('SELECT role,staff_kind,client_kind,client_id,is_owner FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL FOR SHARE',[ws,user])).rows[0];
  const o=(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,id])).rows[0];
  if(!m)throw new ApiError(403,'forbidden',PRICE_PERMISSION);
  if(!o||o.archived_at||m.role==='technician'&&o.assignee_id!==user||m.role==='client'&&(o.client_id!==m.client_id||m.client_kind==='household'&&o.created_by!==user))throw new ApiError(404,'not_found','This job was not found.');
  return {c:{db,user,ws,...m} as Context,o};
}
export async function sendQuote(user: string, ws: string, id: string, body: unknown,key?:string) {
  const data = quoteSchema.parse(body);
  return withSystem(async db => {
    const {c,o}=await quoteContext(db,user,ws,id);
    // The existing payments handover is the owner's permission for an admin to handle prices.
    await db.query('SELECT id FROM workspaces WHERE id=$1 FOR SHARE',[ws]);
    if(c.role!=='admin'||!await ownerCan(c,'payments'))throw new ApiError(403,'forbidden',PRICE_PERMISSION);
    return replay(db,user,ws+'/work-orders/'+id+'/quote',key,data,async()=>{
      if (o.status === 'done' || o.status === 'cancelled') throw invalid('This job is closed.', 'amount');
      const name=await who(c);
      const r = (await db.query("UPDATE work_orders SET quote_amount=$3, quote_note=$4, quote_status='pending', quote_decided_by=NULL, quote_decided_at=NULL WHERE workspace_id=$1 AND id=$2 RETURNING id, quote_amount, quote_note, quote_status", [ws, id, data.amount, data.note || null])).rows[0];
      const prior=await priceChangeOn(db,ws,id);
      if(prior)await priceEvent(db,ws,o,user,{...prior,state:'pending'},'Waiting for the client');
      await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
        SELECT m.user_id,$1,'quote_sent','work_orders',$2,$3,$4,$5 FROM members m WHERE m.workspace_id=$1 AND m.role='client' AND m.client_id=$6 AND m.archived_at IS NULL AND (coalesce(m.client_kind,'manager')='manager' OR m.user_id=$7::uuid)`,
        [ws, id, user, name, o.title, o.client_id, o.created_by]);
      return r;
    });
  }, user);
}

/** The current client answers a locked job. The displayed amount protects against a replaced quote. */
export async function decideQuote(user: string, ws: string, id: string, body: unknown,key?:string) {
  const data=decideSchema.parse(body);
  const {decision}=data;
  return withSystem(async db => {
    const {c,o}=await quoteContext(db,user,ws,id);
    allowClientAnswer(c,o);
    return replay(db,user,ws+'/work-orders/'+id+'/quote/decision',key,data,async()=>{
      if (o.status==='done'||o.status==='cancelled'||o.quote_status !== 'pending') throw new ApiError(409, 'no_quote', o.quote_status ? 'This price was already answered.' : 'There is no price to approve on this job yet.');
      if(data.amount!==undefined&&Number(o.quote_amount)!==data.amount)throw new ApiError(409,'stale','The price changed. Open the job and review it again.');
      const name=await who(c);
      const r = (await db.query("UPDATE work_orders SET quote_status=$3, quote_decided_by=$4, quote_decided_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING id, quote_amount, quote_status", [ws, id, decision, user])).rows[0];
      const prior=await priceChangeOn(db,ws,id);
      if(prior)await priceEvent(db,ws,o,user,{...prior,state:decision},decision==='approved'?'Price approved':'Client said no');
      await notifyOffice(db, ws, id, user, name, o.title, 'quote_decided', decision);
      await priceNotice(db,ws,o,user,decision==='approved'?'Price approved. The team can go ahead.':'Client said no. Work stays on hold.');
      return r;
    });
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
