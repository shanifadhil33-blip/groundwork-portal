import { expect,it } from 'vitest';
import { messageInput } from '../lib/services/messages';
it('validates message content and keeps payload choices explicit',()=>{
 expect(messageInput.parse({body:' Hello '})).toMatchObject({body:'Hello',photo_ids:[],visibility:'client'});
 expect(messageInput.safeParse({body:'Hello',phone:'+971500001234'}).success).toBe(false);
 expect(messageInput.safeParse({body:'x',photo_ids:Array(5).fill('10000000-0000-4000-8000-000000000001')}).success).toBe(false);
});
it('Agent message tools stay within each role and show message content on the card',async()=>{
 const {allowedTool}=await import('../lib/agent/role-tools');const {actionSummary}=await import('../lib/ui/assistant-replies');
 for(const role of ['admin','staff','office','technician','client:manager','client:office','client:household']){expect(allowedTool(role,'list_messages')).toBe(true);expect(allowedTool(role,'send_message')).toBe(true);}
 expect(actionSummary('send_message',{body:'Please check reception',photo_ids:['photo']},null,'Ravi')).toContain('Send a message to Ravi.\nPlease check reception\nPhotos: 1');
});
