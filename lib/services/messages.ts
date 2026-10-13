import { DEFAULT_LANGUAGE } from '../languages';
import { z } from 'zod';
import { ApiError,invalid,missing } from '../http';
import { inWorkspace,replay,row,uuid } from './shared';
import { getPreferences } from './settings';
import { translationPieces,translationSource,replaceTranslation } from '../i18n';
import { translateUi,type PrivateTranslationThread } from './translations';
export const threadInput=z.object({conversation_id:uuid.optional(),work_order_id:uuid.optional()}).strict();
export const messageInput=z.object({conversation_id:uuid.optional(),work_order_id:uuid.optional(),recipient_id:uuid.optional(),body:z.string().trim().max(20000).default(''),photo_ids:z.array(uuid).max(4).default([]),voice_note_text:z.string().trim().max(20000).optional(),visibility:z.enum(['client','internal']).default('client')}).strict();
export async function messagePeople(user:string,ws:string){return inWorkspace(user,ws,async c=>(await c.db.query('SELECT * FROM message_people($1)',[ws])).rows);}
export async function startConversation(user:string,ws:string,recipient:string){uuid.parse(recipient);return inWorkspace(user,ws,async c=>{
 if(!(await c.db.query('SELECT can_message_person($1,$2) AS allowed',[ws,recipient])).rows[0].allowed)throw new ApiError(403,'forbidden','You can message people connected to your work only.');
 const participants=[user,recipient].sort();
 const made=(await c.db.query('INSERT INTO conversations(workspace_id,participants) VALUES($1,$2) ON CONFLICT(workspace_id,participants) DO NOTHING RETURNING id',[ws,participants])).rows[0];
 return made??(await c.db.query('SELECT id FROM conversations WHERE workspace_id=$1 AND participants=$2',[ws,participants])).rows[0];
});}
async function checkThread(c:Parameters<Parameters<typeof inWorkspace>[2]>[0],d:z.infer<typeof threadInput>){
 if(Number(!!d.conversation_id)+Number(!!d.work_order_id)!==1)throw invalid('Choose one message thread.');
 if(d.work_order_id)return row(c,'work_orders',d.work_order_id);
 if(!(await c.db.query('SELECT id FROM conversations WHERE workspace_id=$1 AND id=$2',[c.ws,d.conversation_id])).rows[0])throw missing();
}
export async function sendMessage(user:string,ws:string,body:unknown,key?:string){const d=messageInput.parse(body);
 if(Number(!!d.conversation_id)+Number(!!d.work_order_id)+Number(!!d.recipient_id)!==1)throw invalid('Choose one message thread or person.');
 if(!d.body&&!d.photo_ids.length)throw invalid('Write a message or add a photo.','body');
 return inWorkspace(user,ws,async c=>replay(c.db,user,ws+'/messages',key,d,async()=>{
  const conversation_id=d.recipient_id?(await startConversation(user,ws,d.recipient_id)).id:d.conversation_id;
  const job=await checkThread(c,{conversation_id,work_order_id:d.work_order_id});
  const language=(await getPreferences(user)).language??DEFAULT_LANGUAGE;
  if(d.work_order_id){if(c.role==='client'&&d.visibility==='internal')throw invalid('Your message must be visible to the client.','visibility');
   return (await c.db.query('INSERT INTO comments(workspace_id,client_id,work_order_id,author_id,body,visibility,photo_ids,voice_note_text,original_language) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,work_order_id,body,visibility,photo_ids,voice_note_text,original_language,created_at,author_name AS sender_name',[ws,job!.client_id,d.work_order_id,user,d.body||'Photo',d.visibility,JSON.stringify(d.photo_ids),d.voice_note_text??null,language])).rows[0];
  }
  return (await c.db.query('INSERT INTO messages(workspace_id,conversation_id,sender_id,sender_name,body,photo_ids,voice_note_text,original_language) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,conversation_id,body,photo_ids,voice_note_text,original_language,created_at,sender_name',[ws,conversation_id,user,'Team member',d.body,JSON.stringify(d.photo_ids),d.voice_note_text??null,language])).rows[0];
 }));
}
export async function listMessages(user:string,ws:string,body:unknown){const d=threadInput.parse(body);
 const result=await inWorkspace(user,ws,async c=>{
  await checkThread(c,d);
  const language=(await getPreferences(user)).language??DEFAULT_LANGUAGE;
  const messages=d.work_order_id?(await c.db.query("SELECT id,work_order_id,author_id AS sender_id,coalesce(author_name,'Team member') AS sender_name,body,visibility,photo_ids,voice_note_text,original_language,created_at FROM comments WHERE workspace_id=$1 AND work_order_id=$2 ORDER BY created_at DESC,id DESC LIMIT 100",[ws,d.work_order_id])).rows.reverse():(await c.db.query('SELECT id,conversation_id,sender_id,sender_name,body,photo_ids,voice_note_text,original_language,created_at,pinned_at,removed_at FROM messages WHERE workspace_id=$1 AND conversation_id=$2 ORDER BY (pinned_at IS NOT NULL) DESC,created_at DESC,id DESC LIMIT 100',[ws,d.conversation_id])).rows.sort((a,b)=>new Date(a.created_at).getTime()-new Date(b.created_at).getTime());
  return {language,messages:messages.map(m=>m.removed_at?{...m,body:'Message removed by an admin',photo_ids:[],voice_note_text:null,removed:true}:m)};
 });
 // Translation occurs after the read transaction; it never gains access to another thread.
 const translated=await translateMessageBodies(user,result.language,result.messages.map(m=>m.body),{ws,...d});
 return {data:result.messages.map((m,i)=>({...m,original_body:m.body,body:translated[i],translated:translated[i]!==m.body})),language:result.language,last_message_at:result.messages.at(-1)?.created_at??null};
}
export async function translateMessageBodies(user:string,language:string,bodies:string[],privateThread?:PrivateTranslationThread){
 const sources=[...new Set(bodies.flatMap(body=>translationPieces(body).map(translationSource).filter((s):s is string=>!!s)))];
 const translations:Record<string,string>=Object.create(null);
 for(let offset=0;offset<sources.length;offset+=200)Object.assign(translations,(await translateUi(user,{lang:language,strings:sources.slice(offset,offset+200)},privateThread)).translations);
 return bodies.map(body=>replaceTranslation(body,translations));
}

export async function unreadMessages(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 const data=(await c.db.query(`WITH items AS (
 SELECT m.id,m.conversation_id,NULL::uuid AS work_order_id,m.sender_id,m.sender_name,m.created_at,NULL::integer AS order_number,t.kind AS thread_kind FROM messages m JOIN conversations t ON t.id=m.conversation_id AND t.workspace_id=m.workspace_id WHERE m.workspace_id=$1
 UNION ALL SELECT cm.id,NULL,cm.work_order_id,cm.author_id,coalesce(cm.author_name,'Team member'),cm.created_at,w.order_number,'job' FROM comments cm JOIN work_orders w ON w.id=cm.work_order_id AND w.workspace_id=cm.workspace_id WHERE cm.workspace_id=$1
 ) SELECT a.*,count(*) OVER()::int AS _total,count(*) FILTER(WHERE a.thread_kind='team') OVER()::int AS _team_total FROM items a LEFT JOIN message_reads r ON r.workspace_id=$1 AND r.user_id=$2 AND (r.conversation_id=a.conversation_id OR r.work_order_id=a.work_order_id)
 WHERE a.sender_id<>$2 AND a.created_at>coalesce(r.last_read_at,'epoch'::timestamptz) ORDER BY a.created_at DESC LIMIT 100`,[ws,user])).rows;
 const unread_count=data[0]?Number(data[0]._total):0,team_unread_count=data[0]?Number(data[0]._team_total):0;for(const item of data){delete item._total;delete item._team_total;}return {unread_count,team_unread_count,direct_unread_count:unread_count-team_unread_count,data};
});}
export async function listThreads(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 const direct=(await c.db.query(`SELECT c.id,c.participants,c.created_at,p.name AS title,'direct' AS kind,
 (SELECT max(created_at) FROM messages WHERE workspace_id=c.workspace_id AND conversation_id=c.id) AS last_message_at,
 (SELECT count(*)::int FROM messages m WHERE m.workspace_id=c.workspace_id AND m.conversation_id=c.id AND m.sender_id<>$2 AND m.created_at>coalesce((SELECT last_read_at FROM message_reads r WHERE r.workspace_id=c.workspace_id AND r.user_id=$2 AND r.conversation_id=c.id),'epoch')) AS unread_count
 FROM conversations c LEFT JOIN LATERAL message_people($1) p ON p.user_id=CASE WHEN c.participants[1]=$2 THEN c.participants[2] ELSE c.participants[1] END WHERE c.workspace_id=$1 AND c.kind='direct' ORDER BY last_message_at DESC NULLS LAST,c.id`,[ws,user])).rows;
 const jobs=(await c.db.query(`SELECT w.id,w.order_number,w.title,'job' AS kind,max(cm.created_at) AS last_message_at,
 count(*) FILTER(WHERE cm.author_id<>$2 AND cm.created_at>coalesce(r.last_read_at,'epoch'))::int AS unread_count
 FROM work_orders w JOIN comments cm ON cm.workspace_id=w.workspace_id AND cm.work_order_id=w.id LEFT JOIN message_reads r ON r.workspace_id=w.workspace_id AND r.work_order_id=w.id AND r.user_id=$2
 WHERE w.workspace_id=$1 GROUP BY w.id,w.order_number,w.title,r.last_read_at ORDER BY last_message_at DESC LIMIT 50`,[ws,user])).rows;
 return {data:[...direct,...jobs].sort((a,b)=>new Date(b.last_message_at??b.created_at).getTime()-new Date(a.last_message_at??a.created_at).getTime())};
});}
export async function markThreadRead(user:string,ws:string,body:unknown){const d=threadInput.extend({through:z.iso.datetime({offset:true}),through_id:uuid.optional()}).strict().parse(body);
 return inWorkspace(user,ws,async c=>{
  await checkThread(c,d);const field=d.conversation_id?'conversation_id':'work_order_id',id=d.conversation_id??d.work_order_id;
  if(new Date(d.through).getTime()>Date.now()+1000)throw invalid('Use the last message time.','through');
  let through=d.through;
  if(d.through_id){const table=d.work_order_id?'comments':'messages';const stamp=(await c.db.query(`SELECT created_at::text AS stamp FROM ${table} WHERE workspace_id=$1 AND ${field}=$2 AND id=$3`,[ws,id,d.through_id])).rows[0];if(!stamp)throw missing();through=stamp.stamp;}
  await c.db.query(`INSERT INTO message_reads(workspace_id,user_id,${field},last_read_at) VALUES($1,$2,$3,$4) ON CONFLICT(workspace_id,user_id,${field}) WHERE ${field} IS NOT NULL DO UPDATE SET last_read_at=greatest(message_reads.last_read_at,EXCLUDED.last_read_at)`,[ws,user,id,through]);
  await c.db.query("UPDATE notifications SET read_at=coalesce(read_at,clock_timestamp()) WHERE workspace_id=$1 AND user_id=$2 AND entity_id=$3 AND kind IN ('message_received','comment_added','team_message') AND created_at<=$4",[ws,user,id,through]);
  return {read:true};
 });
}
