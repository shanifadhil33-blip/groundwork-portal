import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError } from '../http';
import { inWorkspace, replay, row, uuid, type Context } from './shared';
import { visitChargeFor } from './visit-charge';

export type PriceChange = { state:'waiting_price'|'pending'|'approved'|'declined'|'refused'; words:string; technician_name:string; refusal_words?:string; visit_charge?:number|null; currency?:string };
export const PRICE_HOLD = 'Work is on hold until the client approves the price.';
export const priceChangeInput = z.object({words:z.string().trim().min(1).max(2000)}).strict();
export async function priceChangeOn(db:PoolClient,ws:string,id:string):Promise<PriceChange|null> {
 return (await db.query("SELECT details FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2 AND kind='price_change' ORDER BY created_at DESC,id DESC LIMIT 1",[ws,id])).rows[0]?.details??null;
}
export const priceHeld = (change:PriceChange|null|undefined) => !!change && ['waiting_price','pending','declined'].includes(change.state);
/** Call only after locking the job, so an approval and a work write cannot cross. */
export async function assertPriceReleased(db:PoolClient,ws:string,id:string) {
 if(priceHeld(await priceChangeOn(db,ws,id)))throw new ApiError(409,'price_hold',PRICE_HOLD);
}
export async function priceEvent(db:PoolClient,ws:string,job:any,user:string,details:PriceChange,body:string) {
 await db.query("INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES($1,$2,$3,$4,'price_change',$5,$6,clock_timestamp())",[ws,job.client_id,job.id,user,body,JSON.stringify(details)]);
}
export async function priceNotice(db:PoolClient,ws:string,job:any,user:string,body:string,clients=false) {
 await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,work_order_title,job_step_body)
 SELECT m.user_id,$1,'job_next_step','work_orders',$2,$3,$4,$5 FROM members m WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.user_id<>$3
 AND (m.role IN ('admin','staff') OR m.user_id=$6 OR ($7 AND m.role='client' AND m.client_id=$8 AND (coalesce(m.client_kind,'manager')='manager' OR m.user_id=$9)))`,[ws,job.id,user,job.title,body,job.assignee_id,clients,job.client_id,job.created_by]);
}
async function assigned(db:PoolClient,user:string,ws:string,id:string) {
 uuid.parse(ws);uuid.parse(id);
 const m=(await db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL FOR SHARE',[ws,user])).rows[0];
 const job=(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,id])).rows[0];
 if(!m||m.role!=='technician'||!job||job.archived_at||job.assignee_id!==user)throw new ApiError(403,'forbidden','This job is not yours.');
 return job;
}
export async function reportPriceChange(user:string,ws:string,id:string,body:unknown,key?:string) {
 const data=priceChangeInput.parse(body);
 return withSystem(async db=>{
  const job=await assigned(db,user,ws,id);
  return replay(db,user,ws+'/work-orders/'+id+'/price-change',key,data,async()=>{
   if(['done','cancelled'].includes(job.status))throw new ApiError(409,'closed','This job is already closed.');
   const name=String((await db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'Technician');
   const details:PriceChange={state:'waiting_price',words:data.words,technician_name:name};
   // Existing close guard permits this narrow, authorized system operation. A number in words is never a quote.
   await db.query("SELECT set_config('app.close_job',$1,true)",[id]);
   await db.query('UPDATE work_orders SET quote_status=NULL,quote_amount=NULL,quote_note=NULL,quote_decided_by=NULL,quote_decided_at=NULL WHERE workspace_id=$1 AND id=$2',[ws,id]);
   await priceEvent(db,ws,job,user,details,'Price changed');
   await priceNotice(db,ws,job,user,'Waiting for a price. Work is on hold.');
   return details;
  });
 },user);
}
/** Entry 18: a no answer holds work; the assigned technician separately confirms the ended visit in his words. */
export async function reportClientRefused(user:string,ws:string,id:string,body:unknown,key?:string) {
 const data=priceChangeInput.parse(body);
 return withSystem(async db=>{
  const job=await assigned(db,user,ws,id);
  return replay(db,user,ws+'/work-orders/'+id+'/client-refused',key,data,async()=>{
   const prior=await priceChangeOn(db,ws,id);
   if(['done','cancelled'].includes(job.status)||!prior||prior.state!=='declined')throw new ApiError(409,'price_hold','The client must say no to the price first.');
   const charge=await visitChargeFor({db,user,ws,role:'technician',client_id:null} as Context,job.site_id);
   const details:PriceChange={...prior,state:'refused',refusal_words:data.words,visit_charge:charge.amount,currency:charge.currency};
   await db.query("SELECT set_config('app.close_job',$1,true)",[id]);
   await db.query("UPDATE work_orders SET status='cancelled' WHERE workspace_id=$1 AND id=$2",[ws,id]);
   await priceEvent(db,ws,job,user,details,'Client refused');
   // A short client visible summary; a charge is never turned into a bill automatically.
   await db.query("INSERT INTO comments(workspace_id,client_id,work_order_id,author_id,body,visibility) VALUES($1,$2,$3,$4,$5,'client')",[ws,job.client_id,id,user,'Client refused. The visit is closed. No further work will continue.']);
   await priceNotice(db,ws,job,user,'Client refused. The visit is closed. The owner decides any visit charge.',true);
   return details;
  });
 },user);
}
export async function waitingPrices(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>(await c.db.query(`SELECT o.id,o.order_number,o.title,o.quote_amount,o.quote_note,o.quote_status,o.status,p.details AS price_change
 FROM work_orders o LEFT JOIN LATERAL (SELECT details FROM work_order_events e WHERE e.workspace_id=o.workspace_id AND e.work_order_id=o.id AND e.kind='price_change' ORDER BY e.created_at DESC,e.id DESC LIMIT 1) p ON true
 WHERE o.workspace_id=$1 AND o.archived_at IS NULL AND o.status NOT IN ('done','cancelled')
 AND (o.quote_status='pending' OR p.details->>'state' IN ('waiting_price','declined')) ORDER BY o.order_number`,[ws])).rows);
}
export async function getPriceChange(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{await row(c,'work_orders',id);return priceChangeOn(c.db,ws,id);});
}
