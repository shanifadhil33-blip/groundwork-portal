import { afterAll,expect,it } from 'vitest';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { sendMessage,listMessages,messagePeople,unreadMessages,markThreadRead } from '../lib/services/messages';
import { listNotifications } from '../lib/services/notifications';
afterAll(closePools);
it('each allowed pair sends both ways and receives a private thread and bell',async()=>{
 const pairs=[[ids.ravi,ids.pranav],[ids.ravi,ids.imran],[ids.ravi,ids.sam],[ids.pranav,ids.imran],[ids.pranav,ids.sam],[ids.imran,ids.sam],[ids.pranav,ids.kevin],[ids.nabil,ids.ravi]];
 for(const [sender,receiver] of pairs){const sent=await sendMessage(sender,ids.ridgeline,{recipient_id:receiver,body:'Please check the visit'});
 const incoming=await listMessages(receiver,ids.ridgeline,{conversation_id:sent.conversation_id});expect(incoming.data.some(m=>m.id===sent.id)).toBe(true);
 const reply=await sendMessage(receiver,ids.ridgeline,{conversation_id:sent.conversation_id,body:'I will check it'});
 expect((await listMessages(sender,ids.ridgeline,{conversation_id:sent.conversation_id})).data.some(m=>m.id===reply.id)).toBe(true);
 expect((await listNotifications(receiver,ids.ridgeline,new URLSearchParams('pageSize=100'))).data.some(n=>n.kind==='message_received'&&n.entity_id===sent.conversation_id)).toBe(true);
 expect(JSON.stringify(incoming)).not.toContain('phone');
 }
});
it('receiver reads clear only his unread messages through the viewed timestamp',async()=>{
 const sent=await sendMessage(ids.sam,ids.ridgeline,{recipient_id:ids.pranav,body:'Visit confirmed'});
 expect((await unreadMessages(ids.pranav,ids.ridgeline)).data.some(m=>m.id===sent.id)).toBe(true);
 await markThreadRead(ids.pranav,ids.ridgeline,{conversation_id:sent.conversation_id,through:sent.created_at.toISOString()});
 expect((await unreadMessages(ids.pranav,ids.ridgeline)).data.some(m=>m.id===sent.id)).toBe(false);
 const later=await sendMessage(ids.sam,ids.ridgeline,{conversation_id:sent.conversation_id,body:'Please use reception'});
 expect((await unreadMessages(ids.pranav,ids.ridgeline)).data.some(m=>m.id===later.id)).toBe(true);
});
it('clients cannot reach another company and technicians cannot reach an unassigned client',async()=>{
 await expect(sendMessage(ids.pranav,ids.ridgeline,{recipient_id:ids.omar,body:'Wrong company'})).rejects.toMatchObject({status:403});
 const client=await withUser(ids.sam,async db=>(await db.query('SELECT user_id FROM members m WHERE workspace_id=$1 AND role=\'client\' AND NOT EXISTS(SELECT 1 FROM work_orders w WHERE w.workspace_id=m.workspace_id AND w.client_id=m.client_id AND w.assignee_id=$2) LIMIT 1',[ids.ridgeline,ids.ravi])).rows[0]);
 if(client)await expect(sendMessage(ids.ravi,ids.ridgeline,{recipient_id:client.user_id,body:'Wrong client'})).rejects.toMatchObject({status:403});
 expect((await messagePeople(ids.pranav,ids.ridgeline)).some(p=>p.user_id===ids.omar)).toBe(false);
});
it('Agent attention names unread senders and reads the same thread results',async()=>{
 const {callTool}=await import('../lib/agent/tools');
 const sent=await sendMessage(ids.sam,ids.ridgeline,{recipient_id:ids.pranav,body:'Please check reception'});
 const attention=await callTool({user:ids.pranav,ws:ids.ridgeline,kind:'assistant',scope:'read'},'needs_attention',{});
 expect((attention.structuredContent as any).result.messages.some((m:any)=>m.id===sent.id&&m.summary.includes('Sam'))).toBe(true);
 const read=await callTool({user:ids.pranav,ws:ids.ridgeline,kind:'assistant',scope:'read'},'list_messages',{conversation_id:sent.conversation_id});
 expect((read.structuredContent as any).result.data.some((m:any)=>m.id===sent.id)).toBe(true);
});
it('household and technician can message each other only through his assigned request',async()=>{
 const {createWorkOrder,getWorkOrder,patchWorkOrder}=await import('../lib/services/work-orders');const {decideSuggestion}=await import('../lib/services/suggestions');const {siteId}=await import('../scripts/seed');
 await withUser(ids.sam,db=>db.query('UPDATE work_orders SET assignee_id=NULL WHERE workspace_id=$1 AND created_by=$2 AND assignee_id=$3',[ids.ridgeline,ids.faisal,ids.ravi]));
 const request=await createWorkOrder(ids.faisal,ids.ridgeline,{title:'Tap leaks',site_id:siteId(4),preferred_window:'Saturday'});
 const accepted=await decideSuggestion(ids.sam,ids.ridgeline,request.id,{decision:'approved'});let job=await getWorkOrder(ids.sam,ids.ridgeline,accepted.work_order_id);
 job=await patchWorkOrder(ids.sam,ids.ridgeline,job.id,{assignee_id:ids.ravi,updated_at:job.updated_at.toISOString()});
 const sent=await sendMessage(ids.ravi,ids.ridgeline,{recipient_id:ids.faisal,body:'I will check the tap'});
 expect((await listMessages(ids.faisal,ids.ridgeline,{conversation_id:sent.conversation_id})).data.some(m=>m.id===sent.id)).toBe(true);
 await sendMessage(ids.faisal,ids.ridgeline,{conversation_id:sent.conversation_id,body:'Please come after 4 PM'});
 await patchWorkOrder(ids.sam,ids.ridgeline,job.id,{assignee_id:null,updated_at:job.updated_at.toISOString()});
 await expect(listMessages(ids.ravi,ids.ridgeline,{conversation_id:sent.conversation_id})).rejects.toMatchObject({status:404});
 await expect(sendMessage(ids.ravi,ids.ridgeline,{recipient_id:ids.faisal,body:'No longer assigned'})).rejects.toMatchObject({status:403});
});
it('photos reach the authorized reader and long or photo only messages remain readable',async()=>{
 const {uploadSharedPhoto,getSharedPhoto}=await import('../lib/services/shared-photos');
 const photo=await uploadSharedPhoto(ids.sam,ids.ridgeline,{mime:'image/jpeg',width:1,height:1,data:Buffer.from([255,216,255,...Array(130).fill(0)]).toString('base64')});
 const sent=await sendMessage(ids.sam,ids.ridgeline,{recipient_id:ids.pranav,body:'',photo_ids:[photo.id]});
 expect((await listMessages(ids.pranav,ids.ridgeline,{conversation_id:sent.conversation_id})).data.find(m=>m.id===sent.id)?.photo_ids).toEqual([photo.id]);
 expect((await getSharedPhoto(ids.pranav,ids.ridgeline,photo.id)).mime).toBe('image/jpeg');
 await expect(getSharedPhoto(ids.omar,ids.ridgeline,photo.id)).rejects.toMatchObject({status:404});
 const text='Please check reception. '.repeat(60);const long=await sendMessage(ids.sam,ids.ridgeline,{recipient_id:ids.pranav,body:text});
 expect((await listMessages(ids.pranav,ids.ridgeline,{conversation_id:long.conversation_id})).data.find(m=>m.id===long.id)?.body).toBe(text.trim());
});
it('job messages share comments with correct visibility and sender names',async()=>{
 const {orderId}=await import('../scripts/seed');
 const sent=await sendMessage(ids.sam,ids.ridgeline,{work_order_id:orderId(1),body:'Reception opens at nine',visibility:'client'});
 expect((await listMessages(ids.pranav,ids.ridgeline,{work_order_id:orderId(1)})).data.find(m=>m.id===sent.id)?.sender_name).toBe('Sam');
 const note=await sendMessage(ids.sam,ids.ridgeline,{work_order_id:orderId(1),body:'Internal cost',visibility:'internal'});
 expect((await listMessages(ids.pranav,ids.ridgeline,{work_order_id:orderId(1)})).data.some(m=>m.id===note.id)).toBe(false);
});
it('translation uses the reader language and stays private to that reader and thread',async()=>{
 const {createHash}=await import('node:crypto');const {patchPreferences}=await import('../lib/services/settings');
 const sent=await sendMessage(ids.sam,ids.ridgeline,{recipient_id:ids.omar,body:'Tomorrow'});
 await patchPreferences(ids.omar,{language:'ml'});
 try{await withUser(ids.omar,db=>db.query('INSERT INTO message_translations(workspace_id,user_id,conversation_id,lang,source_hash,source,translated) VALUES($1,$2,$3,$4,$5,$6,$7)',[ids.ridgeline,ids.omar,sent.conversation_id,'ml',createHash('sha256').update('Tomorrow').digest('hex'),'Tomorrow','നാളെ']));
 const incoming=await listMessages(ids.omar,ids.ridgeline,{conversation_id:sent.conversation_id});expect(incoming.data.find(m=>m.id===sent.id)).toMatchObject({body:'നാളെ',original_body:'Tomorrow',translated:true});
 expect((await withUser(ids.imran,db=>db.query('SELECT source FROM message_translations'))).rows).toEqual([]);
 }finally{await patchPreferences(ids.omar,{language:'en-IN'});}
});
