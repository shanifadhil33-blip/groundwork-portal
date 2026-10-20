import { z } from 'zod';
import { withSystem } from '../db';
import { phoneKey } from '../phone-key';
import { allowTeam, inWorkspace, uuid } from './shared';
import { createSuggestion } from './suggestions';
import { ApiError } from '../http';
export const whatsappMessage=z.object({from:z.string().trim().min(5).max(30),name:z.string().trim().min(1).max(200),text:z.string().trim().min(1).max(20000),media:z.array(uuid).max(4).default([])}).strict();
export { phoneKey };
export function parseWhatsApp(body:unknown){const m=whatsappMessage.parse(body);return {...m,phone:phoneKey(m.from),title:m.text.split(/[\n.!?]/)[0].slice(0,200)||'WhatsApp request',problem:m.text,photo_ids:m.media};}
export async function intakeWhatsApp(user:string,ws:string,body:unknown){
 const m=parseWhatsApp(body);await inWorkspace(user,ws,async c=>allowTeam(c));
 // Read only matching contact ids with owner access. Intake authorization happens first.
 const contact=await withSystem(async db=>{
  const people=(await db.query("SELECT m.user_id,m.client_id FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.role='client' AND m.archived_at IS NULL AND regexp_replace(regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'),'^00','')=$2 ORDER BY m.created_at LIMIT 2",[ws,m.phone])).rows;
  if(people.length===1)return {client_id:people[0].client_id,sender_user_id:people[0].user_id};
  const clients=(await db.query("SELECT id FROM clients WHERE workspace_id=$1 AND archived_at IS NULL AND regexp_replace(regexp_replace(coalesce(phone,''),'[^0-9]','','g'),'^00','')=$2 LIMIT 2",[ws,m.phone])).rows;
  if(clients.length!==1)return null;
  const managers=(await db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND client_id=$2 AND archived_at IS NULL AND role='client' AND coalesce(client_kind,'manager')='manager' ORDER BY created_at LIMIT 2",[ws,clients[0].id])).rows;
  return {client_id:clients[0].id,sender_user_id:managers.length===1?managers[0].user_id:null};
 },user);
 const sites=contact?await inWorkspace(user,ws,async c=>(await c.db.query('SELECT id FROM sites WHERE workspace_id=$1 AND client_id=$2 AND archived_at IS NULL LIMIT 2',[ws,contact.client_id])).rows):[];
 return createSuggestion(user,ws,{title:m.title,problem:m.problem,photo_ids:m.photo_ids,client_id:contact?.client_id??null,site_id:sites.length===1?sites[0].id:null},'whatsapp',undefined,{name:m.name,phone:m.from,sender_user_id:contact?.sender_user_id??null});
}
export async function simulateWhatsApp(user:string,ws:string){
 await inWorkspace(user,ws,async c=>{allowTeam(c);if(!(await c.db.query('SELECT is_demo FROM workspaces WHERE id=$1',[ws])).rows[0]?.is_demo)throw new ApiError(403,'forbidden','This sample is for demo companies only.');});
 return intakeWhatsApp(user,ws,{from:'+971500001234',name:'Faisal',text:'The kitchen tap is leaking. Saturday after 4 PM suits me.',media:[]});
}
