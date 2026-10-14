import { z } from 'zod';
import { localDate } from '../dates';
import type { Context } from '../services/shared';
type Issue={field:string;code:string;message:string};
const normalTitle=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
export type RowData={title:string;description:string;client:string;site:string;priority:string;scheduled_for:string;due_on:string;external_ref:string;site_id?:string;client_id?:string};
type SiteLookup={id:string;client_id:string;name:string;address:string;client_name:string};
type OrderLookup={order_number:number|string;title:string;status:string;site_id:string;external_ref:string|null;due_on:string|null;scheduled_for:string|Date|null};
export type ValidationLookup={timezone:string;sites:SiteLookup[];references:Map<string,OrderLookup>;titles:Map<string,OrderLookup[]>};
export function addLookupOrder(lookup:ValidationLookup,order:OrderLookup) {
 if(order.external_ref&&!lookup.references.has(order.external_ref.toLowerCase()))lookup.references.set(order.external_ref.toLowerCase(),order);
 if(!['done','cancelled'].includes(order.status)) {const key=normalTitle(order.title);lookup.titles.set(key,[...(lookup.titles.get(key)??[]),order]);}
}
// Read only candidate sites/titles/references once, under the caller's transaction/RLS.
export async function validationLookup(c:Context,inputs:Partial<RowData>[]):Promise<ValidationLookup> {
 const sites=[...new Set(inputs.map(r=>(r.site??'').trim().toLowerCase()))];
 const titles=[...new Set(inputs.map(r=>normalTitle(r.title??'')))];
 const references=[...new Set(inputs.map(r=>(r.external_ref??'').trim().toLowerCase()).filter(Boolean))];
 const r=(await c.db.query(`SELECT timezone,
  coalesce((SELECT jsonb_agg(s) FROM (SELECT s.*,cl.name AS client_name FROM sites s JOIN clients cl ON cl.id=s.client_id AND cl.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND (lower(s.name)=ANY($2::text[]) OR lower(s.address)=ANY($2::text[]))) s),'[]') AS sites,
  coalesce((SELECT jsonb_agg(w) FROM (SELECT order_number,title,status,site_id,external_ref,due_on,scheduled_for FROM work_orders WHERE workspace_id=$1 AND (lower(external_ref)=ANY($4::text[]) OR (status NOT IN ('done','cancelled') AND lower(regexp_replace(trim(title),'\\s+',' ','g'))=ANY($3::text[])))) w),'[]') AS orders
  FROM workspaces WHERE id=$1`,[c.ws,sites,titles,references])).rows[0];
 const lookup:ValidationLookup={timezone:r.timezone,sites:r.sites,references:new Map(),titles:new Map()};
 for(const order of r.orders)addLookupOrder(lookup,order);
 return lookup;
}
export async function validateRow(c:Context,input:Partial<RowData>,seen?:Map<string,number>,number=1,lookup?:ValidationLookup) {
 const data:RowData={title:'',description:'',client:'',site:'',priority:'',scheduled_for:'',due_on:'',external_ref:'',...input};
 const errors:Issue[]=[],warnings:Issue[]=[];
 const error=(field:string,code:string,message:string)=>errors.push({field,code,message});
 data.title=data.title.trim();
 if(!data.title||data.title.length>200)error('title','required','Provide a title of 1 to 200 characters.');
 if(data.description.length>20000)error('description','length','Description must be 20000 characters or fewer.');
 const sites=(lookup?lookup.sites.filter(s=>s.name.toLowerCase()===data.site.trim().toLowerCase()||s.address.toLowerCase()===data.site.trim().toLowerCase()):(await c.db.query(`SELECT s.*,c.name AS client_name FROM sites s JOIN clients c ON c.id=s.client_id AND c.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND (lower(s.name)=lower($2) OR lower(s.address)=lower($2))`,[c.ws,data.site.trim()])).rows).filter(s=>!data.client.trim()||s.client_name.toLowerCase()===data.client.trim().toLowerCase());
 delete data.site_id;delete data.client_id;
 if(sites.length!==1)error('site','unknown_site','Choose a known site and matching client in this workspace.');
 else {data.site_id=sites[0].id;data.client_id=sites[0].client_id;data.site=sites[0].name;data.client=sites[0].client_name;}
 data.priority=data.priority.trim().toLowerCase()||'normal';
 if(!['low','normal','high','urgent'].includes(data.priority)){warnings.push({field:'priority',code:'unknown_priority',message:'Unknown priority; using normal.'});data.priority='normal';}
 const timezone=lookup?.timezone??(await c.db.query('SELECT timezone FROM workspaces WHERE id=$1',[c.ws])).rows[0].timezone;
 for(const field of ['due_on','scheduled_for'] as const) {
  if(!data[field])continue;
  const instant=z.iso.datetime({offset:true}).safeParse(data[field]);
  if(instant.success){data[field]=field==='due_on'?localDate(instant.data,timezone):new Date(instant.data).toISOString();continue;}
  let date=data[field];
  const m=date.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if(m)date=`${m[3].length===2?'20'+m[3]:m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  if(!z.iso.date().safeParse(date).success)error(field,'bad_date','Use a valid date.');
  else data[field]=date; // Preserve date-only cells as calendar dates throughout review.
 }
 data.external_ref=data.external_ref.trim();
 if(data.external_ref) {
  const key='ref:'+data.external_ref.toLowerCase();
  if(seen?.has(key))error('external_ref','duplicate_file',`Duplicate of row ${seen.get(key)}`);else seen?.set(key,number);
  const duplicate=lookup?lookup.references.get(data.external_ref.toLowerCase()):(await c.db.query('SELECT order_number FROM work_orders WHERE workspace_id=$1 AND lower(external_ref)=lower($2) LIMIT 1',[c.ws,data.external_ref])).rows[0];
  if(duplicate)error('external_ref','duplicate_ref',`External reference already used by WO ${duplicate.order_number}.`);
 }
 if(data.site_id) {
  // A repeated title is only a duplicate when site, reference and dates also match.
  const key=JSON.stringify([data.site_id,normalTitle(data.title),data.external_ref.toLowerCase(),data.due_on,data.scheduled_for]);
  if(seen?.has(key))error('title','duplicate_file',`Duplicate of row ${seen.get(key)}`);else seen?.set(key,number);
  const matches=lookup?(lookup.titles.get(normalTitle(data.title))??[]):(await c.db.query(`SELECT order_number,site_id,external_ref,due_on,scheduled_for FROM work_orders WHERE workspace_id=$1 AND status NOT IN ('done','cancelled') AND lower(regexp_replace(trim(title),'\\s+',' ','g'))=$2`,[c.ws,normalTitle(data.title)])).rows;
  const same=matches.find(order=>order.site_id===data.site_id && (order.external_ref??'').toLowerCase()===data.external_ref.toLowerCase() && (order.due_on??'')===data.due_on && (order.scheduled_for?localDate(order.scheduled_for,timezone):'')===(data.scheduled_for?localDate(data.scheduled_for,timezone):''));
  if(same)error('title','duplicate_open',`Already open as work order WO ${same.order_number}`);
  else if(matches.length)warnings.push({field:'title',code:'similar_title',message:'A work order has a similar title. Check the site, reference and dates.'});
 }
 return {data,errors,warnings,status:errors.length?'error':warnings.length?'warning':'valid'};
}
