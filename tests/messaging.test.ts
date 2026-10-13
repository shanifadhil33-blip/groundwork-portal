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
