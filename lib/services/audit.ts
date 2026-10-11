import { activitySentence } from '../ui/polish';
import { z } from 'zod';
import { missing, invalid } from '../http';
import { inWorkspace, uuid } from './shared';
import { paging, parseQuery, feedOffset } from './feed';
export function redact(value:unknown):unknown {
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(token|secret|password|credential|authorization|api[_-]?key|private[_-]?key)/i.test(key)).map(([key,v])=>[key,redact(v)]));return value;
}
function item(r:Record<string,any>) {
 if(r.entity==='import_rows'){if(r.before)r.before={...r.before,filename:r.before.filename??r.import_filename};if(r.after)r.after={...r.after,filename:r.after.filename??r.import_filename,work_order_number:r.after.work_order_number??r.work_order_number};}
 const before=redact(r.before?{...r.before,...('assignee_id' in r.before?{assignee_name:r.before_assignee_name??null}:{})}:null),after=redact(r.after?{...r.after,...('assignee_id' in r.after?{assignee_name:r.after_assignee_name??null}:{})}:null);
 const summary=activitySentence({...r,before,after,entity:r.entity,action:r.action},r.workspace_timezone);
 return {actor_kind:r.actor_kind,via_token_id:r.via_token_id,via_token_name:r.via_token_name,id:r.id,at:new Date(r.at).toISOString(),actor:r.actor_id?{id:r.actor_id,name:r.actor_name??null,email:r.actor_email??null}:null,action:r.action,entity:r.entity,entity_id:r.entity_id,link_target:r.visible_work_order_id?{entity:'work_orders',id:r.visible_work_order_id}:null,summary,before,after};
}
const select=`SELECT a.*,aw.timezone AS workspace_timezone,u.name AS actor_name,u.email AS actor_email,w.id AS visible_work_order_id,w.order_number AS work_order_number,i.filename AS import_filename,bu.name AS before_assignee_name,au.name AS after_assignee_name,mu.name AS member_name FROM audit_log a LEFT JOIN workspaces aw ON aw.id=a.workspace_id LEFT JOIN LATERAL visible_user(a.actor_id) u ON true LEFT JOIN work_orders w ON w.workspace_id=a.workspace_id AND w.id=coalesce(a.work_order_id,CASE WHEN a.entity='work_orders' THEN a.entity_id ELSE nullif(coalesce(a.after->>'work_order_id',a.before->>'work_order_id'),'')::uuid END) LEFT JOIN imports i ON a.entity='import_rows' AND i.workspace_id=a.workspace_id AND i.id=nullif(coalesce(a.after->>'import_id',a.before->>'import_id'),'')::uuid LEFT JOIN LATERAL visible_user(nullif(a.before->>'assignee_id','')::uuid) bu ON true LEFT JOIN LATERAL visible_user(nullif(a.after->>'assignee_id','')::uuid) au ON true LEFT JOIN LATERAL visible_user(nullif(coalesce(a.after->>'user_id',a.before->>'user_id'),'')::uuid) mu ON a.entity='members'`;
// Keep raw audit storage complete; feeds expose meaningful business changes only.
export const auditFeedWhere = `a.entity IN ('workspaces','members','clients','sites','work_orders','comments','invites','imports','import_rows','supplier_orders','supplier_events','supplier_sync_runs','api_tokens')
 AND (a.entity<>'import_rows' OR (a.action='update' AND a.before->>'decision' IS DISTINCT FROM a.after->>'decision'))
 AND (a.entity<>'imports' OR a.action<>'update' OR a.before->>'status' IS DISTINCT FROM a.after->>'status')`;
export async function listAudit(user:string,ws:string,params:URLSearchParams) {
 return inWorkspace(user,ws,async c=>{
  if(c.role==='client')throw missing();
  const q=parseQuery(params,{...paging,actor:uuid.optional(),action:z.string().min(1).max(100).optional(),entity:z.string().min(1).max(100).optional(),entity_id:uuid.optional(),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),sort:z.enum(['newest','oldest']).default('newest')});
  if(q.from&&q.to&&new Date(q.from)>new Date(q.to))throw invalid('From must be before to.','from');
  const values:unknown[]=[ws],where=['a.workspace_id=$1',auditFeedWhere];
  for(const [key,column,op] of [['actor','actor_id','='],['action','action','='],['entity','entity','='],['entity_id','entity_id','='],['from','at','>='],['to','at','<=']] as const)if(q[key]){values.push(q[key]);where.push(`a.${column}${op}$${values.length}`);}
  const clause=where.join(' AND '),total=(await c.db.query(`SELECT count(*)::int AS n FROM audit_log a WHERE ${clause}`,values)).rows[0].n;
  const page=feedOffset(user,ws,q),dir=q.sort==='newest'?'DESC':'ASC';
  const rows=(await c.db.query(`${select} WHERE ${clause} ORDER BY a.at ${dir},a.id ${dir} LIMIT $${values.length+1} OFFSET $${values.length+2}`,[...values,q.pageSize,page.offset])).rows;
  return {data:rows.map(item),total,page:Math.floor(page.offset/q.pageSize)+1,pageSize:q.pageSize,next_cursor:page.next(total)};
 });
}
export async function getAudit(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{if(c.role==='client')throw missing();uuid.parse(id);const r=(await c.db.query(`${select} WHERE a.workspace_id=$1 AND a.id=$2`,[ws,id])).rows[0];if(!r)throw missing();return item(r);});
}
