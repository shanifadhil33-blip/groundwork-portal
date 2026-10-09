import { z } from 'zod';
import type { Context } from '../services/shared';
export type Issue={field:string;code:string;message:string};
export const normalTitle=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export type RowData={title:string;description:string;client:string;site:string;priority:string;scheduled_for:string;external_ref:string;site_id?:string;client_id?:string};
export async function validateRow(c:Context,input:Partial<RowData>,seen?:Map<string,number>,number=1) {
 const data:RowData={title:'',description:'',client:'',site:'',priority:'',scheduled_for:'',external_ref:'',...input};
 const errors:Issue[]=[],warnings:Issue[]=[];
 const error=(field:string,code:string,message:string)=>errors.push({field,code,message});
 data.title=data.title.trim();
 if(!data.title||data.title.length>200)error('title','required','Provide a title of 1 to 200 characters.');
 if(data.description.length>20000)error('description','length','Description must be 20000 characters or fewer.');
 const sites=(await c.db.query(`SELECT s.*,c.name AS client_name FROM sites s JOIN clients c ON c.id=s.client_id AND c.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND (lower(s.name)=lower($2) OR lower(s.address)=lower($2))`,[c.ws,data.site.trim()])).rows.filter(s=>!data.client.trim()||s.client_name.toLowerCase()===data.client.trim().toLowerCase());
 delete data.site_id;delete data.client_id;
 if(sites.length!==1)error('site','unknown_site','Choose a known site and matching client in this workspace.');
 else {data.site_id=sites[0].id;data.client_id=sites[0].client_id;data.site=sites[0].name;data.client=sites[0].client_name;}
 data.priority=data.priority.trim().toLowerCase()||'normal';
 if(!['low','normal','high','urgent'].includes(data.priority)){warnings.push({field:'priority',code:'unknown_priority',message:'Unknown priority; using normal.'});data.priority='normal';}
 if(data.scheduled_for) {
  // Spreadsheet date-only values mean midnight in the workspace; explicit ISO instants keep their offset.
  const instant=z.iso.datetime({offset:true}).safeParse(data.scheduled_for);
  if(instant.success) data.scheduled_for=new Date(instant.data).toISOString();
  else {
   let date:string|undefined;
   if(/^\d{4}-\d{2}-\d{2}$/.test(data.scheduled_for))date=data.scheduled_for;
   else {const m=data.scheduled_for.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);if(m)date=`${m[3].length===2?'20'+m[3]:m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;}
   if(!date||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)error('scheduled_for','bad_date','Use a valid scheduled date.');
   else {
    const timezone=(await c.db.query('SELECT timezone FROM workspaces WHERE id=$1',[c.ws])).rows[0].timezone;
    const value=(await c.db.query('SELECT $1::date::timestamp AT TIME ZONE $2 AS value',[date,timezone])).rows[0].value;
    data.scheduled_for=value.toISOString();
   }
  }
 }
 if(data.site_id) {
  const key=data.site_id+':'+normalTitle(data.title);
  if(seen?.has(key))error('title','duplicate_file',`Duplicate of row ${seen.get(key)}`);else seen?.set(key,number);
  const duplicate=(await c.db.query(`SELECT title FROM work_orders WHERE workspace_id=$1 AND status NOT IN ('done','cancelled') AND ((site_id=$2 AND lower(regexp_replace(trim(title),'\\s+',' ','g'))=$3) OR ($4<>'' AND external_ref=$4)) LIMIT 1`,[c.ws,data.site_id,normalTitle(data.title),data.external_ref])).rows[0];
  if(duplicate)error('title','duplicate_open',`Already open as work order ${duplicate.title}`);
 }
 return {data,errors,warnings,status:errors.length?'error':warnings.length?'warning':'valid'};
}
