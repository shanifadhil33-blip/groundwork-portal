import { z } from 'zod';
import { invalid } from '../http';
import { allow, inWorkspace, insert, name, replay, row, update } from './shared';
import { EMIRATES, EMAIL_PATTERN, normalizePhone, normalizeTrn } from '../records';
// Optional text: trimmed, empty becomes null (clears the field), length capped.
const text=(max:number)=>z.string().trim().max(max).transform(v=>v||null).nullable().optional();
const phone=z.string().trim().max(40).nullable().optional().transform((v,ctx)=>{if(!v)return v===undefined?undefined:null;const n=normalizePhone(v);if(!n){ctx.addIssue({code:'custom',message:'Enter a UAE number like +971 50 123 4567, or another number with its + country code.'});return z.NEVER;}return n;});
const email=z.string().trim().max(320).nullable().optional().transform((v,ctx)=>{if(!v)return v===undefined?undefined:null;if(!EMAIL_PATTERN.test(v)){ctx.addIssue({code:'custom',message:'Enter a valid email address.'});return z.NEVER;}return v.toLowerCase();});
const trn=z.string().trim().max(40).nullable().optional().transform((v,ctx)=>{if(!v)return v===undefined?undefined:null;const n=normalizeTrn(v);if(!n){ctx.addIssue({code:'custom',message:'A UAE TRN has 15 digits and starts with 100.'});return z.NEVER;}return n;});
export const clientFields={contact_name:text(200),phone,email,billing_building:text(200),billing_street:text(200),billing_area:text(120),billing_city:text(120),billing_emirate:z.enum(EMIRATES).nullable().optional().or(z.literal('').transform(()=>null)),trn,notes:text(2000)};
export const clientSchema=z.object({name,...clientFields}).strict();
export const siteFields={building:text(200),area:text(120),access_notes:text(2000),contact_name:text(200),contact_phone:phone};
export const siteSchema=z.object({name,address:z.string().trim().min(1).max(2000),...siteFields}).strict();
// Leave out keys the caller did not send, so a partial update never clears other fields.
const defined=<T extends Record<string,unknown>>(data:T)=>Object.fromEntries(Object.entries(data).filter(([,v])=>v!==undefined)) as Partial<T>;
export async function listClients(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query('SELECT * FROM clients WHERE workspace_id=$1 ORDER BY name,id',[ws])).rows;});
}
export async function getClient(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return row(c,'clients',id);});
}
export async function createClient(user:string,ws:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const data=defined(clientSchema.parse(body));return replay(c.db,user,ws+'/clients',key,data,()=>insert(c,'clients',{workspace_id:ws,...data}));});
}
export async function patchClient(user:string,ws:string,id:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',id);const data=defined(clientSchema.partial().parse(body));if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'clients',id,data);});
}
export async function deleteClient(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',id);await c.db.query('DELETE FROM clients WHERE workspace_id=$1 AND id=$2',[ws,id]);return {deleted:true};});
}
export async function listSites(user:string,ws:string,client:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);await row(c,'clients',client);return (await c.db.query('SELECT * FROM sites WHERE workspace_id=$1 AND client_id=$2 ORDER BY name,id',[ws,client])).rows;});
}
export async function createSite(user:string,ws:string,client:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',client);const data=defined(siteSchema.parse(body));return replay(c.db,user,ws+'/clients/'+client+'/sites',key,data,()=>insert(c,'sites',{workspace_id:ws,client_id:client,...data}));});
}
export async function patchSite(user:string,ws:string,id:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'sites',id);const data=defined(siteSchema.partial().parse(body));if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'sites',id,data);});
}
export async function deleteSite(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'sites',id);await c.db.query('DELETE FROM sites WHERE workspace_id=$1 AND id=$2',[ws,id]);return {deleted:true};});
}

// A narrow client form lookup; RLS and membership scope every returned site.
export async function requestSites(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['client']);return (await c.db.query('SELECT id,client_id,name,address,building,area FROM sites WHERE workspace_id=$1 AND client_id=$2 ORDER BY name,id',[ws,c.client_id])).rows;});
}
