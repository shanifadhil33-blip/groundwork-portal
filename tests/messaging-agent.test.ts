import { afterAll,expect,it,vi } from 'vitest';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { listMessages } from '../lib/services/messages';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
afterAll(closePools);
it('Agent sends only after Yes and the owner alone can confirm',async()=>{
 vi.mocked(assistantTurn).mockResolvedValue({calls:[{name:'send_message',args:{recipient_id:ids.pranav,body:'Please check reception'},id:'call'}]} as any);
 const before=await withUser(ids.sam,async db=>(await db.query('SELECT count(*)::int AS n FROM messages')).rows[0].n);
 const proposal:any=await assistant(ids.sam,ids.ridgeline,{messages:[{role:'user',content:'Message Pranav about reception'}]});
 expect(proposal.pending_action.summary).toContain('Pranav');expect(proposal.pending_action.summary).toContain('Please check reception');
 expect(await withUser(ids.sam,async db=>(await db.query('SELECT count(*)::int AS n FROM messages')).rows[0].n)).toBe(before);
 await expect(assistant(ids.imran,ids.ridgeline,{messages:[],confirm_action_id:proposal.pending_action.id})).rejects.toMatchObject({status:404});
 const done:any=await assistant(ids.sam,ids.ridgeline,{messages:[],confirm_action_id:proposal.pending_action.id});
 const sent=done.result.structuredContent.result;expect((await listMessages(ids.pranav,ids.ridgeline,{conversation_id:sent.conversation_id})).data.some(m=>m.id===sent.id)).toBe(true);
 await expect(assistant(ids.sam,ids.ridgeline,{messages:[],confirm_action_id:proposal.pending_action.id})).rejects.toMatchObject({status:409});
});
