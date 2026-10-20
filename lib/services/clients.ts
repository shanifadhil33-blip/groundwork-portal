import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { allow, inWorkspace, insert, name, replay, row, update, type Context } from './shared';
import { EMAIL_PATTERN, normalizePhone, normalizeRegion, phoneHint, regionField } from '../records';
import { an, isCountry } from '../countries/rules';

// Optional text: trimmed, empty becomes null (clears the field), length capped.
const text=(max:number)=>z.string().trim().max(max).transform(v=>v||null).nullable().optional();
const optional=(max:number,check:(v:string)=>string|null,message:string)=>z.string().trim().max(max).nullable().optional().transform((v,ctx)=>{if(!v)return v===undefined?undefined:null;const n=check(v);if(!n){ctx.addIssue({code:'custom',message});return z.NEVER;}return n;});
const email=optional(320,v=>EMAIL_PATTERN.test(v)?v.toLowerCase():null,'Enter a valid email address.');
const countryCode=z.string().trim().toUpperCase().refine(isCountry,'Choose a country from the list.');
/** A country override: a country code, or null (or empty) to follow the workspace. */
const countryOverride=z.union([countryCode,z.literal('').transform(()=>null),z.null()]).optional();
// Country rules: the phone plan and region list of the country the record follows.
const phone=(cc:string)=>optional(40,v=>normalizePhone(v,cc),`Enter a number like ${phoneHint(cc)}, or a number from another country with its + code.`);
const region=(cc:string)=>{const r=regionField(cc);return optional(120,v=>normalizeRegion(v,cc),r.options?`Choose ${an(r.label)} ${r.label.toLowerCase()} from the list.`:`Keep the ${r.label.toLowerCase()} under 120 characters.`);};

// Maintenance contract: visits included and the end date. Blank clears it.
const blank=(v:unknown)=>v===''||v===undefined?(v===''?null:undefined):v;
const contractVisits=z.preprocess(v=>{const b=blank(v);return typeof b==='string'?Number(b.trim()):b;},z.number({message:'Enter the number of visits, like 12.'}).int('Enter a whole number of visits.').min(0).max(999).nullable().optional());
const contractEnds=z.preprocess(blank,z.iso.date({message:'Enter the date like 2027-03-31.'}).nullable().optional());
const clientSchema=(cc:string)=>z.object({name,country:countryOverride,contact_name:text(200),phone:phone(cc),email,billing_building:text(200),billing_street:text(200),billing_area:text(120),billing_city:text(120),billing_region:region(cc),notes:text(2000),contract_visits:contractVisits,contract_ends_on:contractEnds}).strict();
const siteSchema=(cc:string)=>z.object({name,address:z.string().trim().max(2000).optional(),building:text(200),area:text(120),region:region(cc),access_notes:text(2000),contact_name:text(200),contact_phone:phone(cc)}).strict();

/** Field shapes for agent tools (the service applies the country rules). */
const s=(max:number,description:string)=>z.string().max(max).nullable().optional().describe(description);
export const clientShape={country:s(2,'ISO country code of the billing address, like AE or SA. Omit or null to follow the workspace country.'),contact_name:s(200,'Main contact name'),phone:s(40,'Phone. Local numbers are read in the client country; other countries need their + code.'),email:s(320,'Email'),billing_building:s(200,'Building name or number'),billing_street:s(200,'Street'),billing_area:s(120,'Area or district'),billing_city:s(120,'City'),billing_region:s(120,'Region of the client country (UAE emirate, Saudi region, Oman governorate...). Must match the country list when it has one.'),notes:s(2000,'Notes'),contract_visits:z.number().int().min(0).max(999).nullable().optional().describe('Visits the maintenance contract includes. null clears it.'),contract_ends_on:z.iso.date().nullable().optional().describe('Date the maintenance contract ends. null clears it.')};
export const siteShape={building:s(200,'Building name or number'),area:s(120,'Area or district'),region:s(120,'Region of the client country, from its list when it has one'),access_notes:s(2000,'Access notes'),contact_name:s(200,'Site contact name'),contact_phone:s(40,'Site contact phone')};

// Leave out keys the caller did not send, so a partial update never clears other fields.
const defined=<T extends Record<string,unknown>>(data:T)=>Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)) as Partial<T>;
// Columns kept in the table but no longer used (emirate and TRN from before country support, and the removed tax
// number): never returned, so nothing can show or change them.
type Row=Record<string,unknown>;
export function publicClient<T extends Row|null|undefined>(client:T):T{if(!client)return client;const {billing_emirate:_e,trn:_t,tax_id:_x,...rest}=client;return rest as T;}
async function workspaceCountry(c:Context){return (await c.db.query('SELECT country FROM workspaces WHERE id=$1',[c.ws])).rows[0]?.country as string;}
/** The country a request body is checked against: its own valid override, else the current one, else the workspace's. */
function bodyCountry(body:unknown,current:string|null|undefined,fallback:string){
 const sent=(body&&typeof body==='object'&&'country' in body)?(body as Row).country:undefined;
 if(sent===undefined)return current||fallback;
 const parsed=countryOverride.safeParse(sent);return (parsed.success&&parsed.data)||fallback;
}

/** Daily lists hide archived clients; archived=true lists only the archived ones (the Archived view). */
export async function listClients(user:string,ws:string,archived=false) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query(`SELECT * FROM clients WHERE workspace_id=$1 AND archived_at IS ${archived?'NOT ':''}NULL ORDER BY name,id`,[ws])).rows.map(publicClient);});
}
export async function getClient(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);const client=publicClient(await row(c,'clients',id));const used=(await c.db.query("SELECT count(*)::int AS n FROM work_orders WHERE workspace_id=$1 AND client_id=$2 AND payment_status='contract' AND status<>'cancelled'",[ws,id])).rows[0].n;return {...client,contract_used:used};});
}
export async function createClient(user:string,ws:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const cc=bodyCountry(body,null,await workspaceCountry(c));const data=defined(clientSchema(cc).parse(body));return replay(c.db,user,ws+'/clients',key,data,async()=>publicClient(await insert(c,'clients',{workspace_id:ws,...data})));});
}
export async function patchClient(user:string,ws:string,id:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const current=await row(c,'clients',id);const cc=bodyCountry(body,current.country,await workspaceCountry(c));const data=defined(clientSchema(cc).partial().parse(body));if(!Object.keys(data).length)throw invalid('Provide at least one change.');return publicClient(await update(c,'clients',id,data));});
}
/** What a delete would touch, so the confirmation can say it plainly. Office roles can read it. */
async function clientUse(c:Context,id:string){return (await c.db.query(`SELECT (SELECT count(*)::int FROM sites WHERE workspace_id=$1 AND client_id=$2) sites,(SELECT count(*)::int FROM work_orders WHERE workspace_id=$1 AND client_id=$2) jobs,(SELECT count(*)::int FROM members WHERE workspace_id=$1 AND client_id=$2) users,(SELECT count(*)::int FROM invites WHERE workspace_id=$1 AND client_id=$2 AND status='pending') invites`,[c.ws,id])).rows[0] as {sites:number;jobs:number;users:number;invites:number};}
async function siteUse(c:Context,id:string){return (await c.db.query('SELECT count(*)::int jobs FROM work_orders WHERE workspace_id=$1 AND site_id=$2',[c.ws,id])).rows[0] as {jobs:number};}
export async function clientImpact(user:string,ws:string,id:string){return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);await row(c,'clients',id);return clientUse(c,id);});}
export async function siteImpact(user:string,ws:string,id:string){return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);await row(c,'sites',id);return siteUse(c,id);});}
const n=(k:number,w:string)=>`${k} ${w}${k===1?'':'s'}`;
/**
 * Delete is for a record made by mistake. A client or site with jobs is never deleted, so job history is never lost:
 * the server refuses with a plain reason. Client users must be removed first. Sites with no jobs and open invites go with the client.
 */
export async function deleteClient(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',id);const u=await clientUse(c,id);
  if(u.jobs)throw new ApiError(409,'has_history',`This client has ${n(u.jobs,'job')}, so it can not be deleted. Archive it instead to keep the job history.`);
  if(u.users)throw new ApiError(409,'in_use',`This client has ${n(u.users,'user')}. Remove them in Settings, Members first.`);
  await c.db.query('DELETE FROM invites WHERE workspace_id=$1 AND client_id=$2',[ws,id]);await c.db.query('DELETE FROM sites WHERE workspace_id=$1 AND client_id=$2',[ws,id]);
  await c.db.query('DELETE FROM clients WHERE workspace_id=$1 AND id=$2',[ws,id]);return {deleted:true};});
}

/** A site follows its client's country. */
async function siteCountry(c:Context,client:string){return (await c.db.query('SELECT coalesce(cl.country,w.country) AS country FROM clients cl JOIN workspaces w ON w.id=cl.workspace_id WHERE cl.workspace_id=$1 AND cl.id=$2',[c.ws,client])).rows[0]?.country as string;}
export async function listSites(user:string,ws:string,client:string,archived=false) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);await row(c,'clients',client);return (await c.db.query(`SELECT * FROM sites WHERE workspace_id=$1 AND client_id=$2 AND archived_at IS ${archived?'NOT ':''}NULL ORDER BY name,id`,[ws,client])).rows;});
}
export async function createSite(user:string,ws:string,client:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',client);const data=defined(siteSchema(await siteCountry(c,client)).parse(body));if(data.address===undefined)data.address='';return replay(c.db,user,ws+'/clients/'+client+'/sites',key,data,()=>insert(c,'sites',{workspace_id:ws,client_id:client,...data}));});
}
export async function patchSite(user:string,ws:string,id:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const site=await row(c,'sites',id);const data=defined(siteSchema(await siteCountry(c,site.client_id)).partial().parse(body));if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'sites',id,data);});
}
export async function deleteSite(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'sites',id);const u=await siteUse(c,id);
  if(u.jobs)throw new ApiError(409,'has_history',`This site has ${n(u.jobs,'job')}, so it can not be deleted. Archive it instead to keep the job history.`);
  await c.db.query('DELETE FROM sites WHERE workspace_id=$1 AND id=$2',[ws,id]);return {deleted:true};});
}


// A narrow client form lookup; RLS and membership scope every returned site.
export async function requestSites(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['client']);return (await c.db.query('SELECT id,client_id,name,address,building,area,region FROM sites WHERE workspace_id=$1 AND client_id=$2 ORDER BY name,id',[ws,c.client_id])).rows;});
}

/** Archive hides a client or site from daily lists and new jobs; every job and record stays. Unarchive brings it back. Admin only. */
export async function setClientArchived(user:string,ws:string,id:string,archived:boolean){
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',id);return publicClient((await c.db.query(`UPDATE clients SET archived_at=${archived?'now()':'NULL'} WHERE workspace_id=$1 AND id=$2 RETURNING *`,[ws,id])).rows[0]);});
}
export async function setSiteArchived(user:string,ws:string,id:string,archived:boolean){
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'sites',id);return (await c.db.query(`UPDATE sites SET archived_at=${archived?'now()':'NULL'} WHERE workspace_id=$1 AND id=$2 RETURNING *`,[ws,id])).rows[0];});
}
