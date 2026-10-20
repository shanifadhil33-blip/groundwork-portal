import { requireOwner } from './owner';
import { companyOptions,sizeRoles } from '../company';
import { ApiError } from '../http';
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
const schema=z.object({name,timezone:timezone.default('Asia/Dubai'),...placeFields,company_size:z.enum(['small','big']).default('small'),country:country.default('AE')}).strict().transform((d,ctx)=>{const v=place(d,ctx);return {...v,currency:v.currency??currencyFor(v.country)};});
export async function me(user: string) {
 return withUser(user,async db=>({
  user:(await db.query('SELECT u.*,s.phone,s.is_demo FROM visible_user($1) u JOIN users s ON s.id=u.id',[user])).rows[0],
  onboarding_started:Boolean((await db.query('SELECT 1 FROM onboarding_progress WHERE user_id=$1',[user])).rows[0]),
  memberships:(await db.query('SELECT m.workspace_id,m.role,m.extra_roles,m.staff_kind,m.client_kind,m.is_owner,m.is_manager,m.client_id,w.name AS workspace_name,c.name AS client_name FROM members m JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN clients c ON c.id=m.client_id WHERE m.user_id=$1 AND m.archived_at IS NULL ORDER BY w.name',[user])).rows,
 }));
}
export async function createWorkspace(user:string,body:unknown,key?:string) {
 await assertRealUser(user);
 const data=schema.parse(body);
 // create_workspace makes the workspace and its first admin; the caller is then that admin, so RLS allows setting
 // the country fields in the same transaction.
 return withUser(user,db=>replay(db,user,'workspaces',key,data,async()=>{
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended(lower(trim($1)),0))",[data.name]);
  const duplicate=(await db.query('SELECT company_name_exists($1) AS exists',[data.name])).rows[0]?.exists;
  if(duplicate)throw new ApiError(409,'company_exists','A company with this name already exists. Ask to join it, or choose another name.');
  const w=(await db.query('SELECT * FROM create_workspace($1,$2)',[data.name,data.timezone])).rows[0];
  await db.query("UPDATE members SET is_owner=true,extra_roles=$3,size_added_roles=$3 WHERE workspace_id=$1 AND user_id=$2",[w.id,user,data.company_size==='small'?['staff','technician']:[]]);
  if(data.company_size==='small')await db.query("UPDATE workspaces SET enabled_roles=ARRAY['owner','admin','technician'],enabled_dashboards=array_remove(enabled_dashboards,'schedule') WHERE id=$1",[w.id]);
  return (await db.query('UPDATE workspaces SET country=$2,region=$3,currency=$4,company_size=$5 WHERE id=$1 RETURNING *',[w.id,data.country,data.region??null,data.currency,data.company_size])).rows[0];
 }));
}
export async function getWorkspace(user:string,ws:string) { return inWorkspace(user,ws,c=>row(c,'workspaces',ws)); }
/** The company's own words for each role; blank means the standard name. */
export const roleNames=z.object({admin:z.string().trim().max(40).optional(),staff:z.string().trim().max(40).optional(),technician:z.string().trim().max(40).optional(),client:z.string().trim().max(40).optional()}).strict()
 .transform(v=>Object.fromEntries(Object.entries(v).filter(([,x])=>x)));
export async function patchWorkspace(user:string,ws:string,body:unknown) {
 const listingChange=body&&typeof body==='object'&&['listed','listing_area'].some(k=>Object.hasOwn(body,k));
 if(listingChange)await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  const visitChange=body&&typeof body==='object'&&['visit_charge','visit_charge_regions','visit_charge_sample'].some(k=>Object.hasOwn(body,k));
  const owner=(await c.db.query('SELECT is_owner,role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL',[ws,user])).rows[0];
  if(visitChange&&!owner?.is_owner&&owner?.role!=='admin')throw new ApiError(403,'forbidden','Only the owner or an admin can set the visit charge.');
  const ownerFields=['visit_charge','visit_charge_regions','visit_charge_sample','listed','listing_area'];
  if(listingChange&&!owner?.is_owner&&owner?.role!=='admin')throw new ApiError(403,'forbidden','Only the owner or an admin can change the company listing.');
  if((!visitChange&&!listingChange)||!owner?.is_owner||Object.keys(body as object).some(k=>!ownerFields.includes(k)))allow(c,['admin']);const current=await row(c,'workspaces',ws);
  const data=z.object({listed:z.boolean().optional(),listing_area:z.string().trim().max(120).nullable().optional(),visit_charge:z.number().min(0).max(100000).nullable().optional(),visit_charge_regions:z.record(z.string().trim().min(1).max(60),z.number().min(0).max(100000)).refine(v=>Object.keys(v).length<=30,'Use at most 30 regions.').optional(),visit_charge_sample:z.boolean().optional(),name:z.string().trim().min(1).max(80).optional(),timezone:timezone.optional(),country:country.optional(),region:placeFields.region,currency:placeFields.currency,approval_mode:z.enum(['important','every']).optional(),owner_handover:z.array(z.enum(['approval_mode','payments'])).max(2).optional(),role_names:roleNames.optional(),...companyOptions}).strict()
   .transform((d,ctx)=>{
    // A new country without a region clears the old one (it belonged to the old country's list).
    if(d.country&&d.country!==current.country&&d.region===undefined)d.region=null;
    return place({...d,country:d.country??current.country},ctx);
   }).parse(body);
  if(data.listed&&current.is_demo)throw new ApiError(403,'forbidden','Demo companies cannot be listed.');
  // Only a real change needs the owner: a form that sends the current value back must still save the rest.
  if(data.approval_mode!==undefined&&data.approval_mode!==(current.approval_mode??'important'))await requireOwner(c,'approval_mode');
  if(data.owner_handover!==undefined&&JSON.stringify([...data.owner_handover].sort())!==JSON.stringify([...(current.owner_handover??[])].sort()))await requireOwner(c,'handover');
  if(data.country===current.country&&!('country' in (body as object)))delete (data as {country?:string}).country;if(!Object.keys(data).length)throw invalid('Provide at least one change.');if(data.company_size){await row(c,'workspaces',ws,true);const owners=(await c.db.query('SELECT user_id,extra_roles,size_added_roles FROM members WHERE workspace_id=$1 AND is_owner',[ws])).rows;for(const owner of owners){const roles=sizeRoles(owner.extra_roles,owner.size_added_roles,data.company_size);await c.db.query('UPDATE members SET extra_roles=$3,size_added_roles=$4 WHERE workspace_id=$1 AND user_id=$2',[ws,owner.user_id,roles.extra_roles,roles.size_added_roles]);}}return update(c,'workspaces',ws,{...data,...(data.visit_charge_regions!==undefined?{visit_charge_regions:JSON.stringify(data.visit_charge_regions)}:{})});});
}
export async function deleteWorkspace(user:string,ws:string,body:unknown) {
 await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);await requireOwner(c,'close');const data=z.object({confirm_name:z.string()}).strict().parse(body);
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
   (SELECT count(*)::int FROM job_suggestions WHERE workspace_id=$1 AND status='pending') AS pending_suggestions,
   (SELECT count(*)::int FROM import_rows WHERE workspace_id=$1 AND queued AND decision='pending') AS pending_queue_rows,
   (SELECT max(finished_at) FROM supplier_sync_runs WHERE workspace_id=$1) AS last_supplier_sync_at,
   (SELECT timezone FROM workspaces WHERE id=$1) AS timezone
   FROM work_orders WHERE workspace_id=$1`,[ws])).rows[0];
  const by_status=Object.fromEntries(statuses.map(s=>[s,counts[s]]));
  const {timezone,overdue,today_jobs,pending_queue_rows,pending_suggestions,last_supplier_sync_at}=counts;
  return {contract_watch:[],timezone,today:localDate(Date.now(),timezone),by_status,overdue,today_jobs,waiting_on_parts:by_status.waiting_on_parts,pending_queue_rows,pending_suggestions,last_supplier_sync_at};
 });
}

export async function listWorkspaces(user:string){return withUser(user,async db=>(await db.query('SELECT w.* FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=$1 AND m.archived_at IS NULL ORDER BY w.name',[user])).rows);}

/** Rename one role in the company's own words (blank puts back the standard name). Admin only. */
export async function renameRole(user:string,ws:string,role:string,name:string){
 if(role==='client')throw invalid('Facility manager and Facility staff labels follow their permissions.');
 const current=await inWorkspace(user,ws,async c=>{allow(c,['admin']);return (await row(c,'workspaces',ws)).role_names??{};});
 const next={...current,[role]:name.trim()};if(!name.trim())delete (next as Record<string,string>)[role];
 return patchWorkspace(user,ws,{role_names:next});
}
