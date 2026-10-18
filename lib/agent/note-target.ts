import { inWorkspace } from '../services/shared';

/** Match only jobs this person may use. A model supplied id is never evidence of a match. */
export async function noteTargets(user:string,ws:string,messages:string[]) {
 return inWorkspace(user,ws,async c=>{
  const jobs=(await c.db.query(`SELECT w.id,w.order_number,w.title,s.name AS site_name,c.name AS client_name
   FROM work_orders w JOIN sites s ON s.id=w.site_id JOIN clients c ON c.id=w.client_id
   WHERE w.workspace_id=$1 AND ($2::text<>'client' OR w.created_by=$3)
   AND ($2::text<>'technician' OR w.assignee_id=$3) ORDER BY w.order_number`,[ws,c.role,user])).rows;
  // A new target replaces earlier choices. A bare save this may refer to the prior request.
  const said=messages.findLast(m=>!/^\s*save this[.!?]*\s*$/i.test(m))??messages.at(-1)??'';
  const numbers=[...said.matchAll(/\bWO\s*#?\s*(\d+)\b/gi)].map(m=>Number(m[1]));
  const words=(s:string)=>s.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[];
  const skip=new Set(['the','and','for','was','his','has','had','our','your','you','can','put','log','job','not','now','here','there','this','that','with','from','have','work','done','save','note','please','client','request','cleaned','fixed']);
  const wanted=new Set(words(said).filter(w=>w.length>2&&!skip.has(w)));
  const matches=jobs.filter(j=>numbers.length?numbers.includes(j.order_number):words(`${j.title} ${j.site_name} ${j.client_name}`).some(w=>wanted.has(w)));
  return {jobs,matches};
 });
}
