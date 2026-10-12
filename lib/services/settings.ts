import { z } from 'zod';
import { withUser } from '../db';
import { invalid, missing } from '../http';
import { getWorkspace, patchWorkspace, timezone } from './workspaces';
const preferences=z.object({theme:z.enum(['light','dark','system']).optional(),email_notifications:z.boolean().optional(),timezone:timezone.nullable().optional()}).strict();
export async function getPreferences(user:string) {
 return withUser(user,async db=>{
  await db.query('INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
  return (await db.query('SELECT * FROM user_preferences WHERE user_id=$1',[user])).rows[0];
 });
}
export async function patchPreferences(user:string,body:unknown) {
 const data=preferences.parse(body);if(!Object.keys(data).length)throw invalid('Provide at least one change.');
 return withUser(user,async db=>{
  await db.query('INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING',[user]);
  const keys=Object.keys(data);
  return (await db.query(`UPDATE user_preferences SET ${keys.map((k,i)=>k+'=$'+(i+2)).join(',')},updated_at=clock_timestamp() WHERE user_id=$1 RETURNING *`,[user,...Object.values(data)])).rows[0];
 });
}
export async function patchProfile(user:string,body:unknown) {
 const data=z.object({name:z.string().trim().min(1).max(80)}).strict().parse(body);
 return withUser(user,async db=>{const result=(await db.query('UPDATE users SET name=$2 WHERE id=$1 RETURNING id,name,email,image',[user,data.name])).rows[0];if(!result)throw missing();return result;});
}
export async function getSettings(user:string,ws:string) {const w=await getWorkspace(user,ws);return {id:w.id,name:w.name,timezone:w.timezone,country:w.country,region:w.region,currency:w.currency};}
export const patchSettings=patchWorkspace;
