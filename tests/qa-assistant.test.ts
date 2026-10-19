import { beforeEach,expect,it,vi } from 'vitest';
import { actionSummary,plainAssistantReply } from '../lib/ui/assistant-replies';
const state=vi.hoisted(()=>({turn:vi.fn(),call:vi.fn(),actions:new Map<string,any>(),order:{id:'50000000-0000-4000-8000-000000000058',order_number:58,title:'Test access control reader',status:'scheduled',priority:'normal',timezone:'Asia/Dubai',due_on:'2026-11-10',scheduled_for:'2026-11-08T05:00:00Z'},role:'staff',kind:'manager',lengths:new Map<string,string>(),patch:vi.fn()}));
vi.mock('../lib/db',()=>({withSystem:async(cb:(db:unknown)=>unknown)=>cb({query:async()=>({rows:[]})}),ownerPool:{query:async()=>({rows:[]})},appPool:{query:async()=>({rows:[]})},withUser:async(_u:unknown,cb:(db:unknown)=>unknown)=>cb({query:async()=>({rows:[]})}),asAgent:(_actor:unknown,callback:()=>unknown)=>callback()}));
vi.mock('../lib/ai',()=>({assistantTurn:state.turn}));
vi.mock('../lib/services/settings',async original=>({...await original<typeof import('../lib/services/settings')>(),getPreferences:async(user:string)=>({agent_name:null,approval_mode:'ask',reply_length:state.lengths.get(user)??'normal'}),patchPreferences:state.patch}));
vi.mock('../lib/services/agent-learning',()=>({listAgentLearning:async()=>({data:[]})}));
vi.mock('../lib/services/work-orders',()=>({getWorkOrder:async()=>state.order}));
vi.mock('../lib/services/shared',async(orig)=>{const {z}=await import('zod');return {...(await orig<any>()),uuid:z.uuid(),inWorkspace:async(user:string,ws:string,callback:(c:unknown)=>unknown)=>callback({role:state.role,db:{query:async(sql:string,args:any[])=>{
 if(sql.startsWith('INSERT INTO assistant_actions')){const id='60000000-0000-4000-8000-000000000001';state.actions.set(id,{id,user_id:args[1],workspace_id:args[0],tool:args[2],args:JSON.parse(args[3]),expires_at:new Date(Date.now()+600000)});return {rows:[{id}]};}
 if(sql.startsWith('SELECT * FROM assistant_actions')){const row=state.actions.get(args[2]);return {rows:row&&row.user_id===user&&row.workspace_id===ws?[row]:[]};}
 if(sql.startsWith('UPDATE assistant_actions')){state.actions.get(args[0]).consumed_at=new Date();return {rows:[]};}
 if(sql.includes('FROM sites'))return {rows:[{name:'Marina Exchange',client:'Harbor & Pine'}]};
 if(sql.includes('my_client_kind'))return {rows:[{k:state.kind}]};
 return {rows:[]};
 }}})}});
vi.mock('../lib/agent/tools',async()=>{const {z}=await import('zod');return {callTool:state.call,tools:{
 update_work_order_status:{write:true,description:'Status',schema:z.object({id:z.uuid(),status:z.string(),updated_at:z.string()})},
 set_priority:{write:true,description:'Priority',schema:z.object({id:z.uuid(),priority:z.string(),updated_at:z.string()})},
 add_comment:{write:true,description:'Comment',schema:z.object({work_order_id:z.uuid(),body:z.string(),visibility:z.enum(['internal','client']).default('internal')})},
 ask_choice:{write:false,description:'Ask',schema:z.object({question:z.string(),options:z.array(z.string())})},
 set_job_payment:{write:true,description:'Pay',schema:z.object({id:z.uuid(),payment_status:z.string()})},
 create_request:{write:true,description:'Request',schema:z.object({site_id:z.uuid(),title:z.string(),description:z.string().optional(),preferred_window:z.string().optional()})},
 }}});
import { assistant } from '../lib/services/assistant';
const user='10000000-0000-4000-8000-000000000002',ws='20000000-0000-4000-8000-000000000001';
beforeEach(()=>{state.turn.mockReset();state.call.mockReset();state.actions.clear();state.lengths.clear();state.patch.mockReset();state.patch.mockImplementation(async(user:string,body:{reply_length:string})=>{state.lengths.set(user,body.reply_length);return body;});state.role='staff';state.kind='manager';state.call.mockResolvedValue({content:[{type:'text',text:'{}'}],structuredContent:{result:{...state.order}}});});
async function propose(name:string,args:object,text='Change the work order'){state.turn.mockResolvedValue({calls:[{id:'1',name,args}],text:'Action completed.'});return assistant(user,ws,{messages:[{role:'user',content:text}]});}
it('removes complete/truncated IDs and raw words, while retaining safe work-order destinations',()=>{
 const result=plainAssistantReply(`site ID e4ca7ce3…: in_progress; waiting_on_parts; list_sites. [WO 58](/work-orders/${state.order.id}) ${state.order.id}`);
 expect(result).not.toMatch(/site ID|e4ca7ce3|in_progress|waiting_on_parts|list_sites/);expect(result).toContain('In Progress');expect(result).toContain('Waiting on Parts');expect(result).toContain(`](/work-orders/${state.order.id})`);expect(result.split(`](/work-orders/${state.order.id})`)[1]).not.toContain(state.order.id);
 expect(plainAssistantReply('there is no available tool to modify priority')).toContain('Open the job and use Edit');
});
it('saves a team note straight away, with no confirmation card, and logs it',async()=>{
 const body='Technician checked alignment.\nReplace the damaged reader bracket and test three badges.';
 const result=await propose('add_comment',{work_order_id:state.order.id,body,visibility:'client'},'Add an internal note to WO 58');
 expect('pending_action' in result&&result.pending_action).toBeFalsy();expect(state.call).toHaveBeenCalledTimes(1);expect(state.call.mock.calls[0][2]).toMatchObject({visibility:'internal',body});
});
it('confirms priority with old/new values, then returns a concrete linked result exactly once',async()=>{
 const proposal=await propose('set_priority',{id:state.order.id,priority:'high',updated_at:'2026-10-11T00:00:00Z'});const pending='pending_action' in proposal?proposal.pending_action:null;expect(pending?.summary).toContain('Normal → High');expect(state.call).not.toHaveBeenCalled();
 const result=await assistant(user,ws,{messages:[],confirm_action_id:pending!.id});expect(('reply' in result?result.reply:'')).toBe(`Done. Changed priority for [WO 58 Test access control reader](/work-orders/${state.order.id}) to High.`);expect(state.call).toHaveBeenCalledTimes(1);expect(state.turn).toHaveBeenCalledTimes(1);
 await expect(assistant(user,ws,{messages:[],confirm_action_id:pending!.id})).rejects.toMatchObject({status:409});expect(state.call).toHaveBeenCalledTimes(1);
});
it('shows status from/to before the write and names the confirmed change afterward',async()=>{
 const proposal=await propose('update_work_order_status',{id:state.order.id,status:'in_progress',updated_at:'2026-10-11T00:00:00Z'});const pending='pending_action' in proposal?proposal.pending_action:null;expect(pending?.summary).toContain('Scheduled → In Progress');expect(('reply' in proposal?proposal.reply:'')).not.toContain('Action completed');expect(state.call).not.toHaveBeenCalled();
 const result=await assistant(user,ws,{messages:[],confirm_action_id:pending!.id});expect(('reply' in result?result.reply:'')).toBe(`Done. Moved [WO 58 Test access control reader](/work-orders/${state.order.id}) to In Progress.`);
});
it('keeps explicitly client-visible text in both proposal and result',async()=>{
 const proposal=await propose('add_comment',{work_order_id:state.order.id,body:'Please keep the entrance clear.',visibility:'client'},'Add a client-visible comment to WO 58');const pending='pending_action' in proposal?proposal.pending_action:null;expect(pending?.summary).toContain('visible to the client');
 const result=await assistant(user,ws,{messages:[],confirm_action_id:pending!.id});expect(('reply' in result?result.reply:'')).toContain('comment visible to the client');expect(('reply' in result?result.reply:'')).toContain('Please keep the entrance clear.');expect(('reply' in result?result.reply:'')).toContain('](/work-orders/');
});
it.each(['Please confirm this action before I make the change. Action completed.','Please confirm this action before I make the change.'])( 'does not trust provider prose without a stored confirmation: %s',async text=>{
 state.turn.mockResolvedValue({calls:[],text});const result=await assistant(user,ws,{messages:[{role:'user',content:'Move WO 58 to In progress'}]});expect(('reply' in result?result.reply:'')).toContain('No changes have been made.');expect(state.call).not.toHaveBeenCalled();expect(state.actions.size).toBe(0);
});
it('rejects another owner and an expired confirmation before executing anything',async()=>{
 const proposal=await propose('set_priority',{id:state.order.id,priority:'high',updated_at:'2026-10-11T00:00:00Z'});const pending='pending_action' in proposal?proposal.pending_action:null;
 await expect(assistant('other',ws,{messages:[],confirm_action_id:pending!.id})).rejects.toMatchObject({status:404});state.actions.get(pending!.id).expires_at=new Date(Date.now()-1);await expect(assistant(user,ws,{messages:[],confirm_action_id:pending!.id})).rejects.toMatchObject({status:409});expect(state.call).not.toHaveBeenCalled();
});
it('names the site and full request contents in a creation proposal and dates in workspace time',async()=>{
 const proposal=await propose('create_request',{site_id:'40000000-0000-4000-8000-000000000001',title:'Repair cooling',description:'Meeting room cooling is not running.'});const pending='pending_action' in proposal?proposal.pending_action:null;expect(pending?.summary).toContain('Harbor & Pine · Marina Exchange');expect(pending?.summary).toContain('Meeting room cooling is not running.');expect(state.call).not.toHaveBeenCalled();
 expect(actionSummary('update_work_order_dates',{due_on:'2026-11-15'},state.order)).toContain('Due date: Nov 10, 2026 → Nov 15, 2026');
});

it('shows a household client the chosen visit window before confirming a request',async()=>{
 state.role='client';state.kind='household';
 const proposal=await propose('create_request',{description:'Water is dripping and needs a look',site_id:'40000000-0000-4000-8000-000000000001',title:'Repair cooling',preferred_window:'Saturday after 4 PM'});
 const pending='pending_action' in proposal?proposal.pending_action:null;
 expect(pending).toBeTruthy();
 expect(plainAssistantReply(pending!.summary,true)).toContain('\nBest time for the visit: Saturday after 4 PM');
 expect(state.actions.get(pending!.id).args.preferred_window).toBe('Saturday after 4 PM');
 expect(state.call).not.toHaveBeenCalled();
});

it('formats client model replies and staff replies using their audience labels',async()=>{
 state.turn.mockResolvedValue({calls:[],text:'Status: in_progress. Next: Scheduled.'});
 state.role='client';
 expect(await assistant(user,ws,{messages:[{role:'user',content:'What is the status?'}]})).toMatchObject({reply:'Status: Work in Progress. Next: Visit Scheduled.'});
 state.role='staff';
 expect(await assistant(user,ws,{messages:[{role:'user',content:'What is the status?'}]})).toMatchObject({reply:'Status: In Progress. Next: Scheduled.'});
});

it('asks one short question with tap answers instead of guessing, and writes nothing',async()=>{
 state.turn.mockResolvedValue({calls:[{id:'1',name:'ask_choice',args:{question:'Save this as the job report for Villa 12?',options:['Yes','Change']}}]});
 const r:any=await assistant(user,ws,{messages:[{role:'user',content:'save this'}]});
 expect(r.reply).toBe('Save this as the job report for Villa 12?');expect(r.choices).toEqual(['Yes','Change']);expect(r.pending_action).toBeUndefined();expect(state.call).not.toHaveBeenCalled();
});
it('contract payment shows its knock on effects on the same card, and a supervisor is refused before any card',async()=>{
 state.role='admin';
 const p:any=await propose('set_job_payment',{id:state.order.id,payment_status:'contract'},"today's job was under contract, not paid");
 expect(p.pending_action.summary).toContain('covered by the contract');expect(p.pending_action.summary).toContain('no invoice');expect(state.call).not.toHaveBeenCalled();
 state.role='staff';state.turn.mockReset();state.turn.mockResolvedValueOnce({calls:[{id:'1',name:'set_job_payment',args:{id:state.order.id,payment_status:'contract'}}]}).mockResolvedValueOnce({text:'Only an admin can change that.',calls:[]});
 const s:any=await assistant(user,ws,{messages:[{role:'user',content:'mark it as contract'}]});expect(s.pending_action).toBeUndefined();expect(state.call).not.toHaveBeenCalled();
});

for(const length of ['short','normal','detailed'] as const)it(`sends the saved ${length} instruction on every model turn`,async()=>{
 state.lengths.set(user,length);
 state.turn.mockResolvedValueOnce({calls:[{id:'1',name:'ask_choice',args:{question:'Which job?',options:['WO 58','Another job']}}]});
 await assistant(user,ws,{messages:[{role:'user',content:'Help with a job'}]});
 const {replyLengthPrompt}=await import('../lib/agent/replylength');
 expect(state.turn.mock.calls[0][2]).toContain('\n'+replyLengthPrompt(length));
});
it('saves a personal length at once and Undo restores the previous value for only that user',async()=>{
 state.lengths.set(user,'detailed');state.lengths.set('Omar','normal');
 const result:any=await assistant(user,ws,{messages:[{role:'user',content:'shorter'}]});
 expect(result).toMatchObject({reply:'Reply length set to Short (was Detailed).',choices:['Undo']});
 expect(result.pending_action).toBeUndefined();expect(state.actions.size).toBe(0);expect(state.turn).not.toHaveBeenCalled();expect(state.call).not.toHaveBeenCalled();
 expect(state.patch).toHaveBeenLastCalledWith(user,{reply_length:'short'});
 expect(state.lengths.get('Omar')).toBe('normal');
 const undone:any=await assistant(user,ws,{messages:[{role:'user',content:'shorter'},{role:'assistant',content:result.reply},{role:'user',content:'Undo'}]});
 expect(undone.reply).toBe('Reply length restored to Detailed.');expect(undone.choices).toEqual([]);
 expect(state.lengths.get(user)).toBe('detailed');expect(state.lengths.get('Omar')).toBe('normal');expect(state.patch).toHaveBeenCalledTimes(2);
});
it('does not overwrite a newer setting when an old Undo is tapped',async()=>{
 state.lengths.set(user,'normal');
 await assistant(user,ws,{messages:[{role:'assistant',content:'Reply length set to Short (was Detailed).'},{role:'user',content:'Undo'}]});
 expect(state.patch).not.toHaveBeenCalled();expect(state.turn).not.toHaveBeenCalled();
});
it('keeps complete confirmation cards and refusal text for short replies',async()=>{
 const args={id:state.order.id,priority:'high',updated_at:state.order.due_on};
 const normal:any=await propose('set_priority',args);
 state.lengths.set(user,'short');
 const short:any=await propose('set_priority',args);
 expect(short.pending_action.summary).toBe(normal.pending_action.summary);expect(short.pending_action.why).toBe(normal.pending_action.why);
 const refusal='I cannot assign this job. Only an admin can change it. Please ask him to review the current assignment.';
 state.role='admin';state.turn.mockResolvedValue({calls:[],text:refusal});
 const result:any=await assistant(user,ws,{messages:[{role:'user',content:'Who can assign this job?'}]});expect(result.reply).toBe(refusal);
});
