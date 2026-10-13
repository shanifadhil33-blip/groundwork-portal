import { expect,it } from 'vitest';
import { messageInput } from '../lib/services/messages';
it('validates message content and keeps payload choices explicit',()=>{
 expect(messageInput.parse({body:' Hello '})).toMatchObject({body:'Hello',photo_ids:[],visibility:'client'});
 expect(messageInput.safeParse({body:'Hello',phone:'+971500001234'}).success).toBe(false);
 expect(messageInput.safeParse({body:'x',photo_ids:Array(5).fill('10000000-0000-4000-8000-000000000001')}).success).toBe(false);
});
