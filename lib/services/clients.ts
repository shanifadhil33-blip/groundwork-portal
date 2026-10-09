import { z } from 'zod';
import { invalid } from '../http';
import { allow, inWorkspace, insert, name, replay, row, update } from './shared';
const clientSchema=z.object({name}).strict();
const siteSchema=z.object({name,address:z.string().trim().min(1).max(2000)}).strict();
export async function listClients(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query('SELECT * FROM clients WHERE workspace_id=$1 ORDER BY name,id',[ws])).rows;});
}
export async function getClient(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return row(c,'clients',id);});
}
export async function createClient(user:string,ws:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const data=clientSchema.parse(body);return replay(c.db,user,ws+'/clients',key,data,()=>insert(c,'clients',{workspace_id:ws,...data}));});
}
export async function patchClient(user:string,ws:string,id:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',id);return update(c,'clients',id,clientSchema.parse(body));});
}
export async function deleteClient(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',id);await c.db.query('DELETE FROM clients WHERE workspace_id=$1 AND id=$2',[ws,id]);return {deleted:true};});
}
export async function listSites(user:string,ws:string,client:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);await row(c,'clients',client);return (await c.db.query('SELECT * FROM sites WHERE workspace_id=$1 AND client_id=$2 ORDER BY name,id',[ws,client])).rows;});
}
export async function createSite(user:string,ws:string,client:string,body:unknown,key?:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'clients',client);const data=siteSchema.parse(body);return replay(c.db,user,ws+'/clients/'+client+'/sites',key,data,()=>insert(c,'sites',{workspace_id:ws,client_id:client,...data}));});
}
export async function patchSite(user:string,ws:string,id:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'sites',id);const data=siteSchema.partial().parse(body);if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'sites',id,data);});
}
export async function deleteSite(user:string,ws:string,id:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);await row(c,'sites',id);await c.db.query('DELETE FROM sites WHERE workspace_id=$1 AND id=$2',[ws,id]);return {deleted:true};});
}
