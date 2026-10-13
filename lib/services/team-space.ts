import { z } from 'zod';
import { allow,inWorkspace,uuid } from './shared';
import { ApiError,missing } from '../http';
import { messageInput,sendMessage,listMessages } from './messages';
export async function getTeamSpace(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 allow(c,['admin','staff','technician']);
 const thread=(await c.db.query("SELECT id FROM conversations WHERE workspace_id=$1 AND kind='team'",[ws])).rows[0];if(!thread)throw missing();
 return {id:thread.id,name:'Team space',can_moderate:c.role==='admin'};
});}
export async function sendTeamMessage(user:string,ws:string,body:unknown,key?:string){const d=messageInput.omit({conversation_id:true,work_order_id:true,recipient_id:true,visibility:true}).parse(body);const team=await getTeamSpace(user,ws);return sendMessage(user,ws,{...d,conversation_id:team.id},key);}
export async function listTeamMessages(user:string,ws:string){const team=await getTeamSpace(user,ws);return listMessages(user,ws,{conversation_id:team.id});}
export async function moderateTeamMessage(user:string,ws:string,id:string,body:unknown){uuid.parse(id);const d=z.object({action:z.enum(['pin','unpin','remove'])}).strict().parse(body);
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);
  const message=(await c.db.query("SELECT m.id,m.removed_at FROM messages m JOIN conversations t ON t.workspace_id=m.workspace_id AND t.id=m.conversation_id WHERE m.workspace_id=$1 AND m.id=$2 AND t.kind='team' FOR UPDATE OF m",[ws,id])).rows[0];if(!message)throw missing();if(message.removed_at)throw new ApiError(409,'removed','This message was already removed.');
  return d.action==='remove'?(await c.db.query("UPDATE messages SET removed_at=clock_timestamp(),removed_by=$3,pinned_at=NULL,body='Message removed by an admin',photo_ids='[]',voice_note_text=NULL WHERE workspace_id=$1 AND id=$2 RETURNING id,removed_at",[ws,id,user])).rows[0]:(await c.db.query(`UPDATE messages SET pinned_at=${d.action==='pin'?'clock_timestamp()':'NULL'} WHERE workspace_id=$1 AND id=$2 RETURNING id,pinned_at`,[ws,id])).rows[0];
 });
}
