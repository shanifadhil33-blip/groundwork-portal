import { tenantFields, normalizeTenant, checkTenantInput, visibleTenant } from './tenant';
import { checkJobAsset } from './assets';
import { reportEmergency } from './emergencies';
import { detectEmergency, isFalseAlarm } from '../emergency';
import { createSuggestion } from './suggestions';
import { assertWorking } from './time-off';
import { pushJobChange, pushOnTheWay, sendPush } from './push';
import { withSystem } from '../db';
import { TRADES } from '../trades';
import { publicClient } from './clients';
import { z } from 'zod';
import { overdueSql, todaySql, isOverdue, localDate } from '../dates';
import { ApiError, invalid, missing } from '../http';
import { parseListQuery } from '../pagination';
import { allow, hash, inWorkspace, insert, name, priority, replay, row, status, update, uuid ,isOfficeStaff} from './shared';
const timestamp=z.iso.datetime({offset:true});
const mutable=z.object({...tenantFields,asset_id:uuid.nullable(),trade:z.enum(TRADES).nullable(),title:name,description:z.string().max(20000),priority,status,assignee_id:uuid.nullable(),scheduled_for:z.union([timestamp,z.iso.date()]).nullable(),due_on:z.iso.date().nullable(),preferred_window:z.string().trim().max(200).nullable()});
const createSchema=mutable.partial().extend({title:name,client_id:uuid.optional(),site_id:uuid}).strict();
const patchSchema=mutable.partial().extend({on_way:z.literal(true).optional(),updated_at:timestamp.optional(),reopen:z.literal(true).optional(),undo_status:z.literal(true).optional()}).strict();
const clientSchema=z.object({...tenantFields,same_technician:z.boolean().optional(),title:name,description:z.string().max(20000).optional(),preferred_window:z.string().trim().max(200).optional(),priority:priority.optional(),client_id:uuid.optional(),site_id:uuid}).strict();
export const transitions:Record<string,string[]>={
 open:['scheduled','cancelled'],scheduled:['in_progress','open','cancelled'],
 in_progress:['waiting_on_parts','done','scheduled','cancelled'],waiting_on_parts:['in_progress','done','cancelled'],
 done:[],cancelled:[],
};
/** The first person who is not off and fits the trade or area: what Best match shows. */
async function bestFor(c:Parameters<typeof allow>[0],id:string){
 const {suggestWorkers}=await import('./assign');const s:any=await suggestWorkers(c.user,c.ws,id);const b=s.workers.find((w:any)=>!w.off);
 return b&&(b.trade_match||b.area_match)?b.user_id as string:null;
}
async function assignee(c:Parameters<typeof allow>[0],id:string|null|undefined,best?:string|null) {
 if(id&&isOfficeStaff(c)&&id!==best)throw new ApiError(403,'forbidden','Office staff can book the suggested technician only. Ask a supervisor for anyone else.');
 if(!id)return;
 const m=(await c.db.query("SELECT 1 FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL AND role IN ('admin','staff','technician')",[c.ws,id])).rowCount;
 if(!m)throw invalid('Choose someone from your team in this workspace.','assignee_id');
}
export async function listWorkOrders(user:string,ws:string,params:URLSearchParams,all=false) {
 const query=parseListQuery(params);
 return inWorkspace(user,ws,async c=>{
  const timezone=(await row(c,'workspaces',ws)).timezone, now=Date.now();
  const values:unknown[]=[ws],clauses=['workspace_id=$1'];
  const add=(sql:string,value:unknown)=>{values.push(value);clauses.push(sql.replaceAll('?', '$'+values.length));};
  if(query.q)add("(title ILIKE ? OR description ILIKE ? OR ('WO-'||order_number::text) ILIKE ?)",'%'+query.q.replace(/[\\%_]/g,'\\$&')+'%');
  if(query.status.length)add('status=ANY(?::work_order_status[])',query.status);
  if(query.priority.length)add('priority=ANY(?::work_order_priority[])',query.priority);
  if(query.client_id)add('client_id=?',query.client_id);
  if(query.site_id)add('site_id=?',query.site_id);
  for(const key of ['asset_id','id'] as const){if(query[key])add(key+'=?',query[key]);}
  if(query.assignee_id==='unassigned')clauses.push('assignee_id IS NULL');else if(query.assignee_id)add('assignee_id=?',query.assignee_id);
  if(query.overdue)clauses.push('('+overdueSql+')');
  if(query.today)clauses.push('('+todaySql+')');
  if(query.active)clauses.push("status NOT IN ('done','cancelled')");
  clauses.push(query.archived==='true'?'archived_at IS NOT NULL':'archived_at IS NULL');
  const where=clauses.join(' AND ');
  const signature=hash(JSON.stringify({user,ws,...query,cursor:undefined,page:undefined}));
  let offset=(query.page-1)*query.pageSize;
  if(query.cursor) {
   try {
    const cursor=z.object({offset:z.number().int().nonnegative().max(100000000),signature:z.string()}).parse(JSON.parse(Buffer.from(query.cursor,'base64url').toString()));
    if(cursor.signature!==signature)throw new Error();
    offset=cursor.offset;
   }catch{throw invalid('This cursor does not match the list filters.','cursor');}
  }
  const data=(await c.db.query(`SELECT w.*,s.name AS site_name,cl.name AS client_name,a.name AS assignee_name
   FROM (SELECT work_orders.*,count(*) OVER()::int AS _total FROM work_orders WHERE ${where}
    ORDER BY ${query.sort} ${query.dir} NULLS LAST,id ${query.dir} ${all?'':`LIMIT $${values.length+1} OFFSET $${values.length+2}`}) w
   LEFT JOIN sites s ON s.id=w.site_id AND s.workspace_id=w.workspace_id
   LEFT JOIN clients cl ON cl.id=w.client_id AND cl.workspace_id=w.workspace_id
   LEFT JOIN LATERAL visible_assignee(w.workspace_id,w.id) a ON true
   ORDER BY w.${query.sort} ${query.dir} NULLS LAST,w.id ${query.dir}`,all?values:[...values,query.pageSize,offset])).rows;
  // Empty/out-of-range pages still return the full filtered count.
  const total=data[0]?data[0]._total:(await c.db.query('SELECT count(*)::int AS n FROM work_orders WHERE '+where,values)).rows[0].n;
  for(const order of data){delete order._total;visibleTenant(c,order);}
  const next_cursor=offset+data.length<total?Buffer.from(JSON.stringify({offset:offset+data.length,signature})).toString('base64url'):null;
  return {data:data.map(order=>({...order,overdue:isOverdue(order,now,timezone)})),timezone,today:localDate(now,timezone),total,page:Math.floor(offset/query.pageSize)+1,pageSize:query.pageSize,next_cursor};
 });
}
export async function createWorkOrder(user:string,ws:string,body:unknown,key?:string) {
 await inWorkspace(user,ws,async c=>checkTenantInput(c,body));
 if(body&&typeof body==='object'){
  const input=body as Record<string,unknown>;
  const words=`${input.title??''} ${input.description??''}`;
  if(detectEmergency(words)==='people'||isFalseAlarm(words)){
   const result=await reportEmergency(user,ws,words);
   if(result)return result;
  }
 }
 const made=await inWorkspace(user,ws,async c=>{
  if(c.role==='technician')throw new ApiError(403,'forbidden','Ask a supervisor to create the job.');
  // A client's agent may guess a trade; the office sets the trade, so drop it rather than fail the request.
  if(c.role==='client'&&body&&typeof body==='object'&&'trade' in body){const {trade:_t,...rest}=body as Record<string,unknown>;body=rest;}
  checkTenantInput(c,body);
  const data=normalizeTenant((c.role==='client'?clientSchema:createSchema).parse(body));
  if(detectEmergency(`${(data as {title?:string}).title??''} ${(data as {description?:string}).description??''}`))(data as {priority?:string}).priority='urgent';
  if(c.role==='client'){const {description,...fields}=data as z.infer<typeof clientSchema>;return createSuggestion(user,ws,{...fields,problem:description??''},undefined,key);}
  if(c.role==='client' && data.client_id && data.client_id!==c.client_id)throw invalid('Choose one of your own sites.','client_id');
  const site=await row(c,'sites',data.site_id);
  await checkJobAsset(c,'asset_id' in data?data.asset_id as string|null:undefined,site.id);
  const client_id=c.role==='client'?c.client_id:(data.client_id??site.client_id);
  if(site.client_id!==client_id)throw invalid('The site must belong to the selected client.','site_id');
  if(site.archived_at||(await c.db.query('SELECT archived_at FROM clients WHERE workspace_id=$1 AND id=$2',[ws,client_id])).rows[0]?.archived_at)throw invalid('This site or client is archived. Unarchive it first to add a job.','site_id');
  await assignee(c,'assignee_id' in data?data.assignee_id as string|null|undefined:undefined);
  if('status' in data && data.status && data.status!=='open')throw invalid('New requests must start open.','status');
  if('scheduled_for' in data && typeof data.scheduled_for==='string' && data.scheduled_for.length===10) {
   data.scheduled_for=(await c.db.query("SELECT ($1::date + time '09:00') AT TIME ZONE timezone AS value FROM workspaces WHERE id=$2",[data.scheduled_for,ws])).rows[0].value.toISOString();
  }
  if(c.role!=='client')await assertWorking(c,(data as {assignee_id?:string|null}).assignee_id,(data as {scheduled_for?:string|null}).scheduled_for);
  return replay(c.db,user,ws+'/work-orders',key,data,async()=>{
   return insert(c,'work_orders',{
   ...data,client_id,workspace_id:ws,created_by:user,source:c.role==='client'?'client':'manual',
   });
  });
 });
 const emergency=!('emergency' in made)&&!('problem' in made)?await reportEmergency(user,ws,`${made.title} ${made.description??''}`,{work_order_id:made.id,prepareCard:false}):null;
 if(!('emergency' in made)&&!('problem' in made))await pushJobChange(user,null,made as never);
 return emergency?{...made,emergency:true,reply:emergency.reply}:made;
}
const CLIENT_HIDDEN_SITE=['access_notes','contact_name','contact_phone'],CLIENT_HIDDEN_CLIENT=['notes','contact_name','phone','email','billing_building','billing_street','billing_area','billing_city','billing_region','country'];
export async function getWorkOrder(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{
  uuid.parse(id);
  const order=(await c.db.query(`SELECT w.*,(SELECT to_jsonb(a) FROM visible_job_asset(w.workspace_id,w.id) a) AS asset,to_jsonb(s) AS site,to_jsonb(cl) AS client,ws.timezone,
   CASE WHEN w.assignee_id IS NULL THEN NULL ELSE coalesce((SELECT to_jsonb(a) FROM visible_assignee(w.workspace_id,w.id) a),jsonb_build_object('id',w.assignee_id)) END AS assignee,
   coalesce((SELECT jsonb_agg(cm ORDER BY cm.created_at,cm.id) FROM comments cm WHERE cm.workspace_id=w.workspace_id AND cm.work_order_id=w.id),'[]') AS comments,
   coalesce((SELECT jsonb_agg(e ORDER BY e.created_at,CASE WHEN e.kind='created' THEN 0 ELSE 1 END,e.id) FROM work_order_events e WHERE e.workspace_id=w.workspace_id AND e.work_order_id=w.id),'[]') AS timeline
   FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
   JOIN clients cl ON cl.workspace_id=w.workspace_id AND cl.id=w.client_id
   JOIN workspaces ws ON ws.id=w.workspace_id WHERE w.workspace_id=$1 AND w.id=$2`,[ws,id])).rows[0];
  if(!order)throw missing();
  // Match node-postgres timestamp types and the API's existing ISO serialization.
  for(const nested of [order.site,order.client,...order.comments,...order.timeline])for(const key of ['created_at','updated_at'])if(nested[key])nested[key]=new Date(nested[key]);
  // Client users see where the work is, never the team's access notes, site contact or internal client notes.
  if(order.client)order.client=publicClient(order.client);
  if(c.role==='client'&&(c.client_kind??'manager')!=='manager'){delete order.asset_id;if(order.asset)order.asset={name:order.asset.name};}
  if(c.role==='client'){for(const key of CLIENT_HIDDEN_SITE)delete order.site?.[key];for(const key of CLIENT_HIDDEN_CLIENT)delete order.client?.[key];}
  return {...visibleTenant(c,order),overdue:isOverdue(order,Date.now(),order.timezone)};
 });
}
export async function patchWorkOrder(user:string,ws:string,id:string,body:unknown,ifMatch?:string) {
 let before:Record<string,unknown>|null=null;
 const saved=await inWorkspace(user,ws,async c=>{
  // Check record visibility first, then role: own-client PATCH is 403; hidden records 404.
  await row(c,'work_orders',id);allow(c,['admin','staff','technician']);
  const order=await row(c,'work_orders',id,true);before=order;
  checkTenantInput(c,body);
  const parsed=normalizeTenant(patchSchema.parse(body));
  // Technicians see only their own jobs (RLS) and change only the status, never to cancelled.
  if(c.role==='technician'){const {updated_at:_u,reopen:_r,undo_status:_undo,...changes}=parsed;if(Object.keys(changes).some(k=>!['status','on_way'].includes(k))||_r)throw new ApiError(403,'forbidden','You can update the status of your own jobs. Ask a supervisor for other changes.');if(changes.status==='cancelled')throw new ApiError(403,'forbidden','Ask a supervisor to cancel a job.');}
  if('asset_id' in parsed && parsed.asset_id!==order.asset_id)await checkJobAsset(c,parsed.asset_id,order.site_id);
  const version=ifMatch?.replace(/^"|"$/g,'')??parsed.updated_at;
  if(!version)throw invalid('Refresh the work order before saving your changes.','updated_at');
  timestamp.parse(version);
  if(new Date(version).getTime()!==order.updated_at.getTime())throw new ApiError(409,'stale','This request changed since you opened it. Refresh it and try again.');
  const {updated_at:_,reopen,undo_status,on_way,...data}=parsed;
  if(on_way){if(Object.keys(data).length||order.assignee_id!==user||order.status!=='scheduled'||order.on_way_at)throw invalid('This visit is not ready for travel.');return update(c,'work_orders',id,{on_way_at:new Date()});}
  if(!Object.keys(data).length)throw invalid('Provide at least one change.');
  // Audit A5: a booked job with nobody on it goes back to Open, so it shows up as needing a person.
  if('assignee_id' in data&&data.assignee_id===null&&order.status==='scheduled'&&!data.status)data.status='open';
  // Audit A6: the client declined the price, so the technician checks with the office before he starts.
  if(c.role==='technician'&&data.status==='in_progress'&&order.quote_status==='declined')throw new ApiError(409,'price_declined','The client declined the price. Ask your supervisor before you start.');
  if(order.status==='done') {
   const target=order.scheduled_for?'scheduled':'open';
   if(c.role!=='admin')throw new ApiError(403,'forbidden','Only an admin can reopen a completed work order.');
   if(!reopen||data.status!==target||Object.keys(data).length!==1)throw invalid('This work order is completed. Reopen it before making changes.','status');
  } else if(reopen)throw invalid('Only completed work orders can be reopened.','status');
  if(undo_status){
   if(!data.status||Object.keys(data).some(k=>k!=='status')||['done','cancelled'].includes(order.status)||['done','cancelled'].includes(data.status))throw invalid('This status change cannot be undone.','status');
   const event=(await c.db.query("SELECT actor_id,details FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2 AND kind='status_changed' ORDER BY created_at DESC,id DESC LIMIT 1",[ws,id])).rows[0];
   if(event?.actor_id!==user||event.details?.to_status!==order.status||event.details?.from_status!==data.status)throw new ApiError(409,'stale','This job changed. Refresh it and try again.');
  }
  if(!undo_status && order.status!=='done' && data.status && data.status!==order.status && !transitions[order.status].includes(data.status))throw invalid('This status change is not allowed.','status');
  if(typeof data.scheduled_for==='string' && data.scheduled_for.length===10)data.scheduled_for=(await c.db.query("SELECT ($1::date + time '09:00') AT TIME ZONE timezone AS value FROM workspaces WHERE id=$2",[data.scheduled_for,ws])).rows[0].value.toISOString();
  // Office staff may book only the Best match for this job (ROLE08), the same person the Best match button shows.
  const changedTo=data.assignee_id===order.assignee_id?undefined:data.assignee_id;
  if('assignee_id' in data||'scheduled_for' in data)await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[ws+String(data.assignee_id??order.assignee_id)]);
  if('assignee_id' in data||'scheduled_for' in data)await assertWorking(c,'assignee_id' in data?data.assignee_id:order.assignee_id,'scheduled_for' in data?data.scheduled_for:order.scheduled_for);
  await assignee(c,changedTo,isOfficeStaff(c)&&changedTo?await bestFor(c,id):null);
  return update(c,'work_orders',id,data);
 });
 // The locked update and immutable on_way_at guard make this a single event.
 if(before&&!(before as Record<string,unknown>).on_way_at&&saved.on_way_at){
  await withSystem(db=>db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title)
   SELECT DISTINCT m.user_id,$1::uuid,'on_the_way','work_orders',$2::uuid,$3::uuid,coalesce(u.name,'Your team'),$4::text
   FROM members m LEFT JOIN users u ON u.id=$3
   WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND m.user_id<>$3 AND m.role='client' AND m.client_id=$5
    AND (coalesce(m.client_kind,'manager')<>'household' OR m.user_id=$6)`,[ws,id,user,saved.title,saved.client_id,saved.created_by]),user);
  await pushOnTheWay(user,saved as never);
 }
 await pushJobChange(user,before,saved as never);
 await notifyMovedOrRescheduled(user,ws,before,saved as Record<string,unknown>);
 return saved;
}
/** Audit A2 and A4: the technician who lost a job hears it moved; a new visit time reaches the technician and the client people who follow the job. */
async function notifyMovedOrRescheduled(actor:string,ws:string,before:Record<string,any>|null,after:Record<string,any>){
 if(!before)return;
 const t=(v:unknown)=>v?new Date(v as string).getTime():null;
 const moved=before.assignee_id&&before.assignee_id!==after.assignee_id&&before.assignee_id!==actor;
 const rescheduled=t(before.scheduled_for)!==null&&t(after.scheduled_for)!==null&&t(before.scheduled_for)!==t(after.scheduled_for)&&!['done','cancelled'].includes(String(after.status));
 if(!moved&&!rescheduled)return;
 await withSystem(async db=>{
  const name=String((await db.query('SELECT name FROM users WHERE id=$1',[actor])).rows[0]?.name??'Your team');
  const add=(users:string[],kind:string,entity:string)=>users.length?db.query('INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title) SELECT u,$2,$3,$4,$5,$6,$7,$8 FROM unnest($1::uuid[]) u',[users,ws,kind,entity,after.id,actor,name,after.title]):null;
  if(moved)await add([before.assignee_id],'job_unassigned','job_unassigned');
  if(rescheduled){
   const tech=after.assignee_id&&after.assignee_id!==actor&&after.assignee_id===before.assignee_id?[after.assignee_id as string]:[];
   const clients=(await db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND role='client' AND client_id=$2 AND archived_at IS NULL AND user_id<>$4 AND (coalesce(client_kind,'manager')='manager' OR user_id=$3)",[ws,after.client_id,after.created_by,actor])).rows.map(r=>r.user_id as string);
   await add([...tech,...clients],'visit_changed','work_orders');
  }
 },actor);
 if(moved)await sendPush([before.assignee_id],{title:'Job moved',body:`${after.title} was given to someone else. You do not need to go.`,url:'/today',tag:`moved-${after.id}`});
}
export async function createComment(user:string,ws:string,id:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{
  const order=await row(c,'work_orders',id);
  const data=z.object({body:z.string().trim().min(1).max(20000),visibility:z.enum(['client','internal']).default(c.role==='client'?'client':'internal')}).strict().parse(body);
  if(c.role==='client' && data.visibility!=='client')throw invalid('Client comments must be visible to the client.','visibility');
  return replay(c.db,user,ws+'/work-orders/'+id+'/comments',key,data,()=>insert(c,'comments',{...data,workspace_id:ws,client_id:order.client_id,work_order_id:id,author_id:user}));
 });
}

export async function getWorkOrderByNumber(user:string,ws:string,number:number) {
 z.number().int().positive().parse(number);
 return inWorkspace(user,ws,async c=>{
  const order=(await c.db.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND order_number=$2',[ws,number])).rows[0];
  if(!order)throw missing();
  return getWorkOrder(user,ws,order.id);
 });
}

/** Archive or bring back finished and cancelled jobs (universal rule 17): history stays, the daily list gets lighter. */
export async function archiveWorkOrders(user:string,ws:string,body:unknown){
 const data=z.object({ids:z.array(uuid).min(1).max(100),archived:z.boolean()}).strict().parse(body);
 return inWorkspace(user,ws,async c=>{
  if(!['admin','staff'].includes(c.role)||isOfficeStaff(c))throw new ApiError(403,'forbidden','Only an admin or supervisor can archive jobs.');
  const open=(await c.db.query("SELECT order_number FROM work_orders WHERE workspace_id=$1 AND id=ANY($2::uuid[]) AND status NOT IN ('done','cancelled')",[ws,data.ids])).rows;
  if(open.length)throw invalid(`Only finished or cancelled jobs can be archived. WO ${open[0].order_number} is still open.`,'ids');
  const r=await c.db.query(`UPDATE work_orders SET archived_at=${data.archived?'clock_timestamp()':'NULL'} WHERE workspace_id=$1 AND id=ANY($2::uuid[]) RETURNING id`,[ws,data.ids]);
  return {updated:r.rowCount??0,archived:data.archived};
 });
}
