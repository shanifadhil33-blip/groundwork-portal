import { assertRealUser } from './demo';
import { localDate, overdueSql, todaySql } from '../dates';
import { z } from 'zod';
import { an, currencyFor, isCountry, isCurrency, normalizeRegion, regionField } from '../countries/rules';
import { withUser } from '../db';
import { invalid } from '../http';
import { allow, inWorkspace, name, replay, row, update } from './shared';
export const timezone = z.string().refine(value => { try { new Intl.DateTimeFormat('en',{timeZone:value}); return true; } catch { return false; } },'Choose a valid IANA timezone.');
// Where the company works: its country (and that country's region level) sets the address, phone and
// currency rules everywhere in the app. Region is optional; currency defaults to the country's own.
const country=z.string().trim().toUpperCase().refine(isCountry,'Choose a country from the list.');
const currency=z.string().trim().toUpperCase().refine(isCurrency,'Choose a currency from the list.');
const placeFields={country,region:z.string().trim().max(120).nullable().optional(),currency:currency.optional()};
/** The workspace region checked against its country's list (or free text), and the currency defaulted. */
function place<T extends {country?:string;region?:string|null;currency?:string}>(data:T,ctx:z.RefinementCtx){
 if(data.region){const r=normalizeRegion(data.region,data.country);if(!r){const label=regionField(data.country).label.toLowerCase();ctx.addIssue({code:'custom',path:['region'],message:`Choose ${an(label)} ${label} from the list.`});return z.NEVER;}data.region=r;}
 else if(data.region==='')data.region=null;
 return data;
}
const schema=z.object({name,timezone:timezone.default('Asia/Dubai'),...placeFields,country:country.default('AE')}).strict().transform((d,ctx)=>{const v=place(d,ctx);return {...v,currency:v.currency??currencyFor(v.country)};});
export async function me(user: string) {
 return withUser(user,async db=>({
  user:(await db.query('SELECT * FROM visible_user($1)',[user])).rows[0],
  memberships:(await db.query('SELECT m.workspace_id,m.role,m.extra_roles,m.staff_kind,m.client_id,w.name AS workspace_name,c.name AS client_name FROM members m JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN clients c ON c.id=m.client_id WHERE m.user_id=$1 AND m.archived_at IS NULL ORDER BY w.name',[user])).rows,
 }));
}
export async function createWorkspace(user:string,body:unknown,key?:string) {
 await assertRealUser(user);
 const data=schema.parse(body);
 // create_workspace makes the workspace and its first admin; the caller is then that admin, so RLS allows setting
 // the country fields in the same transaction.
 return withUser(user,db=>replay(db,user,'workspaces',key,data,async()=>{
  const w=(await db.query('SELECT * FROM create_workspace($1,$2)',[data.name,data.timezone])).rows[0];
  return (await db.query('UPDATE workspaces SET country=$2,region=$3,currency=$4 WHERE id=$1 RETURNING *',[w.id,data.country,data.region??null,data.currency])).rows[0];
 }));
}
export async function getWorkspace(user:string,ws:string) { return inWorkspace(user,ws,c=>row(c,'workspaces',ws)); }
/** The company's own words for each role; blank means the standard name. */
export const roleNames=z.object({admin:z.string().trim().max(40).optional(),staff:z.string().trim().max(40).optional(),technician:z.string().trim().max(40).optional(),client:z.string().trim().max(40).optional()}).strict()
 .transform(v=>Object.fromEntries(Object.entries(v).filter(([,x])=>x)));
export async function patchWorkspace(user:string,ws:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const current=await row(c,'workspaces',ws);
  const data=z.object({name:z.string().trim().min(1).max(80).optional(),timezone:timezone.optional(),country:country.optional(),region:placeFields.region,currency:placeFields.currency,approval_mode:z.enum(['important','every']).optional(),role_names:roleNames.optional()}).strict()
   .transform((d,ctx)=>{
    // A new country without a region clears the old one (it belonged to the old country's list).
    if(d.country&&d.country!==current.country&&d.region===undefined)d.region=null;
    return place({...d,country:d.country??current.country},ctx);
   }).parse(body);
  if(data.country===current.country&&!('country' in (body as object)))delete (data as {country?:string}).country;if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'workspaces',ws,data);});
}
export async function deleteWorkspace(user:string,ws:string,body:unknown) {
 await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const data=z.object({confirm_name:z.string()}).strict().parse(body);
  const w=await row(c,'workspaces',ws,true);
  if(data.confirm_name!==w.name)throw invalid('Type the workspace name exactly.','confirm_name');
  await c.db.query('SELECT delete_workspace($1)',[ws]);return {deleted:true};
 });
}
export async function dashboard(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{
  const statuses=['open','scheduled','in_progress','waiting_on_parts','done','cancelled'];
  const counts=(await c.db.query(`SELECT ${statuses.map(s=>`count(*) FILTER (WHERE status='${s}')::int AS ${s}`).join(',')},
   count(*) FILTER (WHERE ${overdueSql})::int AS overdue,
   count(*) FILTER (WHERE ${todaySql})::int AS today_jobs,
   (SELECT count(*)::int FROM import_rows WHERE workspace_id=$1 AND queued AND decision='pending') AS pending_queue_rows,
   (SELECT max(finished_at) FROM supplier_sync_runs WHERE workspace_id=$1) AS last_supplier_sync_at,
   (SELECT timezone FROM workspaces WHERE id=$1) AS timezone
   FROM work_orders WHERE workspace_id=$1`,[ws])).rows[0];
  const by_status=Object.fromEntries(statuses.map(s=>[s,counts[s]]));
  const {timezone,overdue,today_jobs,pending_queue_rows,last_supplier_sync_at}=counts;
  return {timezone,today:localDate(Date.now(),timezone),by_status,overdue,today_jobs,waiting_on_parts:by_status.waiting_on_parts,pending_queue_rows,last_supplier_sync_at};
 });
}

export async function listWorkspaces(user:string){return withUser(user,async db=>(await db.query('SELECT w.* FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=$1 AND m.archived_at IS NULL ORDER BY w.name',[user])).rows);}

/** Rename one role in the company's own words (blank puts back the standard name). Admin only. */
export async function renameRole(user:string,ws:string,role:string,name:string){
 const current=await inWorkspace(user,ws,async c=>{allow(c,['admin']);return (await row(c,'workspaces',ws)).role_names??{};});
 const next={...current,[role]:name.trim()};if(!name.trim())delete (next as Record<string,string>)[role];
 return patchWorkspace(user,ws,{role_names:next});
}
