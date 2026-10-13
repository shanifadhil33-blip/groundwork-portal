import { z } from 'zod';
import type { PoolClient } from 'pg';
import { withUser } from '../db';
import { missing } from '../http';
import { uuid } from './shared';
import type { Contact } from '../contact-names';
export const nicknameInput=z.object({nickname:z.string().trim().min(1).max(60).nullable()}).strict();
export async function contactRows(db:PoolClient,user:string,ws:string):Promise<Contact[]>{
 return (await db.query(`SELECT p.*,n.nickname,coalesce(n.nickname,p.real_name) AS name FROM contact_people($1) p
 LEFT JOIN contact_nicknames n ON n.target_user_id=p.user_id AND n.owner_user_id=$2 WHERE p.user_id<>$2 ORDER BY coalesce(n.nickname,p.real_name),p.user_id`,[ws,user])).rows;
}
export async function listContactNames(user:string,ws:string){uuid.parse(ws);return withUser(user,db=>contactRows(db,user,ws));}
export async function saveContactName(user:string,ws:string,target:string,body:unknown){
 uuid.parse(ws);uuid.parse(target);const {nickname}=nicknameInput.parse(body);
 return withUser(user,async db=>{
  const person=(await contactRows(db,user,ws)).find(p=>p.user_id===target);if(!person)throw missing();
  if(nickname===null)await db.query('DELETE FROM contact_nicknames WHERE owner_user_id=$1 AND target_user_id=$2',[user,target]);
  else await db.query(`INSERT INTO contact_nicknames(owner_user_id,workspace_id,target_user_id,nickname) VALUES($1,$2,$3,$4)
   ON CONFLICT(owner_user_id,target_user_id) DO UPDATE SET nickname=EXCLUDED.nickname,workspace_id=EXCLUDED.workspace_id,updated_at=clock_timestamp()`,[user,ws,target,nickname]);
  return {...person,nickname,name:nickname??person.real_name};
 });
}
