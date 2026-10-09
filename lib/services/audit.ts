import { z } from 'zod';
import { missing, invalid } from '../http';
import { inWorkspace, uuid } from './shared';
import { paging, parseQuery, feedOffset } from './feed';
export function redact(value:unknown):unknown {
 if(Array.isArray(value))return value.map(redact);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([key])=>!/(token|secret|password|credential|authorization|api[_-]?key|private[_-]?key)/i.test(key)).map(([key,v])=>[key,redact(v)]));return value;
}
function item(r:Record<string,any>) {
 const before=redact(r.before),after=redact(r.after);
 const summary=r.before?.status!==r.after?.status&&r.before?.status&&r.after?.status?`Status changed from ${r.before.status.replaceAll('_',' ')} to ${r.after.status.replaceAll('_',' ')}`:`${r.entity.replaceAll('_',' ')} ${r.action==='insert'?'created':r.action==='delete'?'deleted':'updated'}`;
 return {actor_kind:r.actor_kind,via_token_id:r.via_token_id,via_token_name:r.via_token_name,id:r.id,at:new Date(r.at).toISOString(),actor:r.actor_id?{id:r.actor_id,name:r.actor_name??null,email:r.actor_email??null}:null,action:r.action,entity:r.entity,entity_id:r.entity_id,summary,before,after};
}
const select='SELECT a.*,u.name AS actor_name,u.email AS actor_email FROM audit_log a LEFT JOIN LATERAL visible_user(a.actor_id) u ON true';
export async function listAudit(user:string,ws:string,params:URLSearchParams) {
 return inWorkspace(user,ws,async c=>{
  if(c.role==='client')throw missing();
  const q=parseQuery(params,{...paging,actor:uuid.optional(),action:z.string().min(1).max(100).optional(),entity:z.string().min(1).max(100).optional(),entity_id:uuid.optional(),from:z.iso.datetime({offset:true}).optional(),to:z.iso.datetime({offset:true}).optional(),sort:z.enum(['newest','oldest']).default('newest')});
  if(q.from&&q.to&&new Date(q.from)>new Date(q.to))throw invalid('From must be before to.','from');
  const values:unknown[]=[ws],where=['a.workspace_id=$1'];
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
