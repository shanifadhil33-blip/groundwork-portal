import { pushJobChange } from './push';
import { TRADES } from '../trades';
import { publicClient } from './clients';
import { z } from 'zod';
import { overdueSql, todaySql, isOverdue, localDate } from '../dates';
import { ApiError, invalid, missing } from '../http';
import { parseListQuery } from '../pagination';
import { allow, hash, inWorkspace, insert, name, priority, replay, row, status, update, uuid } from './shared';
const timestamp=z.iso.datetime({offset:true});
const mutable=z.object({trade:z.enum(TRADES).nullable(),title:name,description:z.string().max(20000),priority,status,assignee_id:uuid.nullable(),scheduled_for:z.union([timestamp,z.iso.date()]).nullable(),due_on:z.iso.date().nullable()});
const createSchema=mutable.partial().extend({title:name,client_id:uuid.optional(),site_id:uuid}).strict();
const patchSchema=mutable.partial().extend({updated_at:timestamp.optional(),reopen:z.literal(true).optional()}).strict();
const clientSchema=z.object({title:name,description:z.string().max(20000).optional(),priority:priority.optional(),client_id:uuid.optional(),site_id:uuid}).strict();
export const transitions:Record<string,string[]>={
 open:['scheduled','cancelled'],scheduled:['in_progress','cancelled'],
 in_progress:['waiting_on_parts','done','cancelled'],waiting_on_parts:['in_progress','done','cancelled'],
 done:[],cancelled:[],
};
async function assignee(c:Parameters<typeof allow>[0],id:string|null|undefined) {
 if(!id)return;
 const m=(await c.db.query("SELECT 1 FROM members WHERE workspace_id=$1 AND user_id=$2 AND role IN ('admin','staff','technician')",[c.ws,id])).rowCount;
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
  if(query.assignee_id==='unassigned')clauses.push('assignee_id IS NULL');else if(query.assignee_id)add('assignee_id=?',query.assignee_id);
  if(query.overdue)clauses.push('('+overdueSql+')');
  if(query.today)clauses.push('('+todaySql+')');
  if(query.active)clauses.push("status NOT IN ('done','cancelled')");
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
  for(const order of data)delete order._total;
  const next_cursor=offset+data.length<total?Buffer.from(JSON.stringify({offset:offset+data.length,signature})).toString('base64url'):null;
  return {data:data.map(order=>({...order,overdue:isOverdue(order,now,timezone)})),timezone,today:localDate(now,timezone),total,page:Math.floor(offset/query.pageSize)+1,pageSize:query.pageSize,next_cursor};
 });
}
export async function createWorkOrder(user:string,ws:string,body:unknown,key?:string) {
 const made=await inWorkspace(user,ws,async c=>{
  if(c.role==='technician')throw new ApiError(403,'forbidden','Ask a supervisor to create the job.');
  const data=(c.role==='client'?clientSchema:createSchema).parse(body);
  if(c.role==='client' && data.client_id && data.client_id!==c.client_id)throw invalid('Choose one of your own sites.','client_id');
  const site=await row(c,'sites',data.site_id);
  const client_id=c.role==='client'?c.client_id:(data.client_id??site.client_id);
  if(site.client_id!==client_id)throw invalid('The site must belong to the selected client.','site_id');
  await assignee(c,'assignee_id' in data?data.assignee_id as string|null|undefined:undefined);
  if('status' in data && data.status && data.status!=='open')throw invalid('New requests must start open.','status');
  if('scheduled_for' in data && typeof data.scheduled_for==='string' && data.scheduled_for.length===10) {
   data.scheduled_for=(await c.db.query("SELECT ($1::date + time '09:00') AT TIME ZONE timezone AS value FROM workspaces WHERE id=$2",[data.scheduled_for,ws])).rows[0].value.toISOString();
  }
  return replay(c.db,user,ws+'/work-orders',key,data,()=>insert(c,'work_orders',{
   ...data,client_id,workspace_id:ws,created_by:user,source:c.role==='client'?'client':'manual',
  }));
 });
 await pushJobChange(user,null,made as never);
 return made;
}
const CLIENT_HIDDEN_SITE=['access_notes','contact_name','contact_phone'],CLIENT_HIDDEN_CLIENT=['notes','contact_name','phone','email','billing_building','billing_street','billing_area','billing_city','billing_region','country'];
export async function getWorkOrder(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{
  uuid.parse(id);
  const order=(await c.db.query(`SELECT w.*,to_jsonb(s) AS site,to_jsonb(cl) AS client,ws.timezone,
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
  if(c.role==='client'){for(const key of CLIENT_HIDDEN_SITE)delete order.site?.[key];for(const key of CLIENT_HIDDEN_CLIENT)delete order.client?.[key];}
  return {...order,overdue:isOverdue(order,Date.now(),order.timezone)};
 });
}
export async function patchWorkOrder(user:string,ws:string,id:string,body:unknown,ifMatch?:string) {
 let before:Record<string,unknown>|null=null;
 const saved=await inWorkspace(user,ws,async c=>{
  // Check record visibility first, then role: own-client PATCH is 403; hidden records 404.
  await row(c,'work_orders',id);allow(c,['admin','staff','technician']);
  const order=await row(c,'work_orders',id,true);before=order;
  const parsed=patchSchema.parse(body);
  // Technicians see only their own jobs (RLS) and change only the status, never to cancelled.
  if(c.role==='technician'){const {updated_at:_u,reopen:_r,...changes}=parsed;if(Object.keys(changes).some(k=>k!=='status')||_r)throw new ApiError(403,'forbidden','You can update the status of your own jobs. Ask a supervisor for other changes.');if(changes.status==='cancelled')throw new ApiError(403,'forbidden','Ask a supervisor to cancel a job.');}
  const version=ifMatch?.replace(/^"|"$/g,'')??parsed.updated_at;
  if(!version)throw invalid('Refresh the work order before saving your changes.','updated_at');
  timestamp.parse(version);
  if(new Date(version).getTime()!==order.updated_at.getTime())throw new ApiError(409,'stale','This request changed since you opened it. Refresh it and try again.');
  const {updated_at:_,reopen,...data}=parsed;
  if(!Object.keys(data).length)throw invalid('Provide at least one change.');
  if(order.status==='done') {
   const target=order.scheduled_for?'scheduled':'open';
   if(c.role!=='admin')throw new ApiError(403,'forbidden','Only an admin can reopen a completed work order.');
   if(!reopen||data.status!==target||Object.keys(data).length!==1)throw invalid('This work order is completed. Reopen it before making changes.','status');
  } else if(reopen)throw invalid('Only completed work orders can be reopened.','status');
  if(order.status!=='done' && data.status && data.status!==order.status && !transitions[order.status].includes(data.status))throw invalid('This status change is not allowed.','status');
  if(typeof data.scheduled_for==='string' && data.scheduled_for.length===10)data.scheduled_for=(await c.db.query("SELECT ($1::date + time '09:00') AT TIME ZONE timezone AS value FROM workspaces WHERE id=$2",[data.scheduled_for,ws])).rows[0].value.toISOString();
  await assignee(c,data.assignee_id);
  return update(c,'work_orders',id,data);
 });
 await pushJobChange(user,before,saved as never);
 return saved;
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
