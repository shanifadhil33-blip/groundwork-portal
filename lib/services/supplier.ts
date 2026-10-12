import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError, forbidden, invalid, missing } from '../http';
import { inWorkspace, type Context, uuid } from './shared';
import { transitions } from './work-orders';
import { appendEvent, cobaltStatus, eventSchema, sourceSnapshot, supplierLabel, type CobaltEvent } from '../cobalt/simulator';
import { signedRequest, verifySignature } from '../cobalt/signature';
import { isOffice } from '../roles';
function access<T>(user:string,ws:string,admin:boolean,fn:(c:Context)=>Promise<T>) {
 return inWorkspace(user,ws,async c=>{if(!isOffice(c.role))throw missing();if(admin&&c.role!=='admin')throw forbidden();const workspace=(await c.db.query('SELECT is_demo FROM workspaces WHERE id=$1',[ws])).rows[0];if(!workspace?.is_demo)throw new ApiError(409,'supplier_not_connected','No supplier is connected. The simulator is available in demo workspaces only.');return fn(c);});
}
// Authorized simulator/sync operations need source-of-truth and timeline writes.
// Recheck membership inside the system transaction, retaining the real audit actor.
async function systemAction<T>(user:string,ws:string,admin:boolean,fn:(db:PoolClient)=>Promise<T>) {
 await access(user,ws,admin,async()=>undefined);
 return withSystem(async db=>{
  const role=(await db.query('SELECT my_role($1) AS role',[ws])).rows[0].role;
  if(!isOffice(role))throw missing();if(admin&&role!=='admin')throw forbidden();
  return fn(db);
 },user);
}
async function lock(db:PoolClient,ws:string){await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['supplier:'+ws]);}
async function project(db:PoolClient,event:CobaltEvent) {
 const order=(await db.query('SELECT * FROM supplier_orders WHERE workspace_id=$1 AND cobalt_ref=$2 FOR UPDATE',[event.workspace_id,event.cobalt_ref])).rows[0];
 if(!order)throw invalid('This supplier order is unavailable.','cobalt_ref');
 // Sequence orders the supplier stream. Terminal states never regress, even for
 // an incorrectly sequenced shipped event; receipt still remains in the ledger.
 const terminal=['delivered','cancelled'].includes(order.local_status);
 if(event.sequence<=Number(order.last_sequence) || (terminal&&event.status!==order.local_status))return;
 await db.query('UPDATE supplier_orders SET local_status=$3,last_sequence=$4,updated_at=clock_timestamp() WHERE workspace_id=$1 AND cobalt_ref=$2',[event.workspace_id,event.cobalt_ref,event.status,event.sequence]);
 if(event.status==='delivered')await db.query("UPDATE work_orders SET status='in_progress' WHERE workspace_id=$1 AND id=$2 AND status='waiting_on_parts'",[event.workspace_id,order.work_order_id]);
}
async function apply(db:PoolClient,event:CobaltEvent,via:'webhook'|'reconcile') {
 const order=(await db.query('SELECT 1 FROM supplier_orders WHERE workspace_id=$1 AND cobalt_ref=$2',[event.workspace_id,event.cobalt_ref])).rowCount;
 if(!order)throw invalid('This supplier order is unavailable.','cobalt_ref');
 const inserted=await db.query('INSERT INTO supplier_events(workspace_id,cobalt_ref,event_id,status,received_via,occurred_at,sequence) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(event_id) DO NOTHING RETURNING id',[event.workspace_id,event.cobalt_ref,event.event_id,event.status,via,event.occurred_at,event.sequence]);
 if(!inserted.rowCount)return {duplicate:true};
 await project(db,event);
 return {duplicate:false};
}
// Signed webhook ingest is the documented owner-only entry point: no session
// identity is trusted. Signature verification always precedes parsing and writes.
export async function ingestWebhook(req:Request) {
 const raw=await req.text();verifySignature(req.headers,raw);
 let payload:unknown;try{payload=JSON.parse(raw);}catch{throw new ApiError(400,'invalid_payload','Send a valid Cobalt event JSON body.');}
 const event=eventSchema.parse(payload);
 return withSystem(async db=>{if(!(await db.query('SELECT is_demo FROM workspaces WHERE id=$1',[event.workspace_id])).rows[0]?.is_demo)throw missing();await lock(db,event.workspace_id);return apply(db,event,'webhook');});
}
export function listOrders(user:string,ws:string){return access(user,ws,false,async c=>({supplier:supplierLabel,data:(await c.db.query('SELECT s.*,w.title AS work_order_title,c.status AS cobalt_status FROM supplier_orders s JOIN work_orders w ON w.workspace_id=s.workspace_id AND w.id=s.work_order_id LEFT JOIN cobalt_orders c ON c.workspace_id=s.workspace_id AND c.cobalt_ref=s.cobalt_ref WHERE s.workspace_id=$1 ORDER BY s.cobalt_ref',[ws])).rows}));}
export async function placeOrder(user:string,ws:string,body:unknown) {
 const placed=await systemAction(user,ws,false,async db=>{
  const {work_order_id}=z.object({work_order_id:uuid}).strict().parse(body);await lock(db,ws);
  const work=(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,work_order_id])).rows[0];if(!work)throw missing();
  if(['done','cancelled'].includes(work.status))throw invalid('Parts cannot be ordered for a closed work order.','work_order_id');
  const ref='CB-'+randomUUID().replaceAll('-','').slice(0,16).toUpperCase();
  await db.query("INSERT INTO cobalt_orders(workspace_id,work_order_id,cobalt_ref,status) VALUES($1,$2,$3,'ordered')",[ws,work_order_id,ref]);
  const order=(await db.query('INSERT INTO supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES($1,$2,$3) RETURNING *',[ws,work_order_id,ref])).rows[0];
  const event=await appendEvent(db,ws,ref,'ordered');
  if(transitions[work.status].includes('waiting_on_parts'))await db.query("UPDATE work_orders SET status='waiting_on_parts' WHERE workspace_id=$1 AND id=$2",[ws,work_order_id]);
  return {supplier:supplierLabel,...order,event};
 });
 try {await ingestWebhook(signedRequest(placed.event));return {...placed,last_sequence:placed.event.sequence,webhook_delivered:true};}
 catch {return {...placed,webhook_delivered:false,message:'Webhook delivery failed. Check and repair to retry.'};}
}
export async function advance(user:string,ws:string,body:unknown) {
 const event=await systemAction(user,ws,true,async db=>{
  const data=z.object({cobalt_ref:z.string().min(1).max(200),status:cobaltStatus,drop:z.boolean().default(false)}).strict().parse(body);await lock(db,ws);
  const order=(await db.query('SELECT * FROM cobalt_orders WHERE workspace_id=$1 AND cobalt_ref=$2 FOR UPDATE',[ws,data.cobalt_ref])).rows[0];if(!order)throw missing();
  const allowed:Record<string,string[]>={ordered:['shipped','cancelled'],shipped:['delivered','cancelled'],delivered:[],cancelled:[]};
  if(!allowed[order.status].includes(data.status))throw invalid('This supplier status change is not allowed.','status');
  await db.query('UPDATE cobalt_orders SET status=$3 WHERE workspace_id=$1 AND cobalt_ref=$2',[ws,data.cobalt_ref,data.status]);
  return {event:await appendEvent(db,ws,data.cobalt_ref,data.status,data.drop),drop:data.drop};
 });
 // Commit supplier state before attempting delivery, just as an external system
 // would. Delivery uses the actual signature/ingest path, without a network call.
 if(event.drop)return {supplier:supplierLabel,...event,delivered:false,message:'Simulate a missed webhook'};
 try {const receipt=await ingestWebhook(signedRequest(event.event));return {supplier:supplierLabel,...event,delivered:true,receipt};}
 catch {return {supplier:supplierLabel,...event,delivered:false,message:'Webhook delivery failed. Check and repair to retry.'};}
}
export function setOutage(user:string,ws:string,body:unknown){return systemAction(user,ws,true,async db=>{
 const {outage}=z.object({outage:z.boolean()}).strict().parse(body);await lock(db,ws);
 await db.query('INSERT INTO cobalt_state(workspace_id,outage) VALUES($1,$2) ON CONFLICT(workspace_id) DO UPDATE SET outage=excluded.outage',[ws,outage]);return {supplier:supplierLabel,outage};
});}
export function events(user:string,ws:string,query:URLSearchParams){return access(user,ws,false,async c=>{
 const {since}=z.object({since:z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0)}).strict().parse(Object.fromEntries(query));return sourceSnapshot(c.db,ws,since);
});}
export function syncRuns(user:string,ws:string){return access(user,ws,false,async c=>(await c.db.query('SELECT * FROM supplier_sync_runs WHERE workspace_id=$1 ORDER BY started_at DESC,id DESC LIMIT 100',[ws])).rows);}
async function compare(db:PoolClient,ws:string) {
 const source=await sourceSnapshot(db,ws);
 const local=(await db.query('SELECT s.*,w.status AS work_status FROM supplier_orders s JOIN work_orders w ON w.workspace_id=s.workspace_id AND w.id=s.work_order_id WHERE s.workspace_id=$1',[ws])).rows;
 const receipts=new Set((await db.query('SELECT event_id FROM supplier_events WHERE workspace_id=$1',[ws])).rows.map(e=>e.event_id));
 const mismatches=[];
 for(const order of source.orders){
  const projection=local.find(s=>s.cobalt_ref===order.cobalt_ref);
  const missingEvents=source.events.filter(e=>e.cobalt_ref===order.cobalt_ref&&!receipts.has(e.event_id));
  if(!projection||projection.local_status!==order.status||missingEvents.length||(order.status==='delivered'&&projection.work_status==='waiting_on_parts')){
   mismatches.push({cobalt_ref:order.cobalt_ref,work_order_id:order.work_order_id,cobalt_status:order.status,local_status:projection?.local_status??null,missing_event_ids:missingEvents.map(e=>e.event_id),message:order.status==='delivered'&&projection?.work_status==='waiting_on_parts'?'Cobalt says delivered, we still show waiting on parts':'Cobalt has updates that are missing locally.'});
  }
 }
 return {source,mismatches};
}
// Cron has no user. Manual operations recheck their admin role in this same
// transaction; all system writes are scoped to the authorized workspace.
async function runSync(ws:string,operation:'check'|'repair',trigger:'manual'|'cron',ref?:string,user?:string) {
 uuid.parse(ws);
 if(trigger==='manual'){if(!user)throw forbidden();await access(user,ws,true,async()=>undefined);}
 await withSystem(async db=>{if(!(await db.query('SELECT is_demo FROM workspaces WHERE id=$1',[ws])).rows[0]?.is_demo)throw new ApiError(409,'supplier_not_connected','No supplier is connected.');});
 const run=await withSystem(async db=>{
  if(user){const role=(await db.query('SELECT my_role($1) AS role',[ws])).rows[0].role;if(!isOffice(role))throw missing();if(role!=='admin')throw forbidden();}
  return (await db.query('INSERT INTO supplier_sync_runs(workspace_id,trigger,operation) VALUES($1,$2,$3) RETURNING id',[ws,trigger,operation])).rows[0].id as string;
 },user);
 try {
  return await withSystem(async db=>{
   if(user){const role=(await db.query('SELECT my_role($1) AS role',[ws])).rows[0].role;if(!isOffice(role))throw missing();if(role!=='admin')throw forbidden();}
   await lock(db,ws);const {source,mismatches}=await compare(db,ws);
   if(ref&&!source.orders.some(o=>o.cobalt_ref===ref))throw missing();
   const selected=mismatches.filter(m=>!ref||m.cobalt_ref===ref);let repaired=0;
   if(operation==='repair'&&selected.length) {
    const events=source.events.filter(e=>selected.some(item=>e.cobalt_ref===item.cobalt_ref&&item.missing_event_ids.includes(e.event_id))).map(e=>eventSchema.parse(e));
    repaired=(await db.query('SELECT repair_supplier_batch($1,$2::jsonb,$3::jsonb) AS repaired',[ws,JSON.stringify(selected),JSON.stringify(events)])).rows[0].repaired;
   }
   await db.query("UPDATE supplier_sync_runs SET finished_at=clock_timestamp(),mismatches_found=$2,repaired_count=$3 WHERE id=$1",[run,selected.length,repaired]);
   return {supplier:supplierLabel,run_id:run,mismatches:selected,repaired};
  },user);
 }catch(error){
  const message=error instanceof ApiError?error.message:'Supplier sync failed. Try again.';
  await withSystem(async db=>db.query("UPDATE supplier_sync_runs SET finished_at=clock_timestamp(),status='error',error_message=$2 WHERE id=$1",[run,message]),user);
  throw error instanceof ApiError?error:new ApiError(503,'sync_failed',message);
 }
}
export function check(user:string,ws:string){return runSync(ws,'check','manual',undefined,user);}
export async function repair(user:string,ws:string,body:unknown){await access(user,ws,true,async()=>undefined);const {cobalt_ref}=z.object({cobalt_ref:z.string().min(1).max(200).optional()}).strict().parse(body);return runSync(ws,'repair','manual',cobalt_ref,user);}
export async function cronSync(){
 // Cobalt is demo-only. Scheduled repairs must preserve demo scenarios; there
 // are no live connectors to check yet.
 return {workspaces:0,checked:0,repaired:0,errors:0,results:[]};
}
