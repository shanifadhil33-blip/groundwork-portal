import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({role:'admin',language:'en-IN',office:false,query:vi.fn(),ai:vi.fn(),tool:vi.fn(),scheduled:'2026-10-01T08:00:00Z'}));
const user='10000000-0000-4000-8000-000000000001',ws='20000000-0000-4000-8000-000000000001',id='50000000-0000-4000-8000-000000000001',ravi='10000000-0000-4000-8000-000000000003';
const order=()=>({id,order_number:3,title:'Repair entry door closer',status:'in_progress',site_name:'Harbor Annex',scheduled_for:state.scheduled,updated_at:'2026-10-22T08:00:00Z',timezone:'Asia/Dubai'});
vi.mock('../lib/ai',()=>({assistantTurn:state.ai}));
vi.mock('../lib/db',()=>({withSystem:vi.fn(()=>{throw Error('No system connection');}),asAgent:(_:unknown,fn:()=>unknown)=>fn(),appPool:{},ownerPool:{}}));
vi.mock('../lib/services/shared',async original=>({...await original<typeof import('../lib/services/shared')>(),inWorkspace:async(actor:string,workspace:string,fn:(c:unknown)=>unknown)=>fn({user:actor,ws:workspace,role:state.role,staff_kind:state.office?'office':null,db:{query:state.query}})}));
vi.mock('../lib/services/settings',()=>({getPreferences:async()=>({language:state.language,reply_length:'normal'})}));
vi.mock('../lib/services/demo-agent-limit',()=>({demoAgentAllowed:async()=>true}));
vi.mock('../lib/services/job-next-step',()=>({quickJobStep:async()=>null}));
vi.mock('../lib/services/emergencies',()=>({reportEmergency:async()=>null}));
vi.mock('../lib/services/household',()=>({householdIntake:async()=>null}));
vi.mock('../lib/services/planned',()=>({planFromWords:async()=>null}));
vi.mock('../lib/services/agent-learning',()=>({listAgentLearning:async()=>({data:[]})}));
vi.mock('../lib/services/agent-words',async original=>({...await original<typeof import('../lib/services/agent-words')>(),listWords:async()=>({company:[],personal:[]}),resolveWords:(s:string)=>s}));
vi.mock('../lib/services/work-orders',()=>({getWorkOrder:async()=>order(),listWorkOrders:async()=>({total:18,data:[order()]})}));
vi.mock('../lib/services/contact-names',()=>({listContactNames:async()=>[{user_id:ravi,name:'Ravi'}]}));
vi.mock('../lib/services/client-visits',async original=>({...await original<typeof import('../lib/services/client-visits')>(),selectedVisitChoice:async()=>null}));
vi.mock('../lib/agent/tools',async original=>({...await original<typeof import('../lib/agent/tools')>(),callTool:state.tool}));
import { assistant } from '../lib/services/assistant';
import { dataAnswer, quickAnswer } from '../lib/agent/data-answers';
import { plainAssistantReply } from '../lib/ui/assistant-replies';
import { LANGUAGES } from '../lib/languages';
import { choiceWords } from '../lib/agent/choices';
const c={user,ws,scope:'read' as const,kind:'assistant' as const};
const ask=(content:string)=>assistant(user,ws,{messages:[{role:'user',content}]}) as Promise<any>;
beforeEach(()=>{
 vi.clearAllMocks();state.role='admin';state.office=false;state.language='en-IN';state.scheduled='2026-10-01T08:00:00Z';
 state.ai.mockResolvedValue(null);
 state.query.mockImplementation(async(sql:string)=>({rows:sql.includes('INSERT INTO assistant_actions')?[{id:'pending'}]:[{timezone:'Asia/Dubai',currency:'AED',approval_mode:'important',extra_roles:[],name:'Imran',d:'2026-10-23'}]}));
 state.tool.mockImplementation(async(_c:unknown,name:string)=>({structuredContent:{result:name==='job_counts'?{name:'Ravi',month:13,total:13}:name==='get_work_order_by_number'?order():name==='list_team'?[{user_id:ravi,name:'Ravi'}]:name==='my_day'?{today:[order()],late:[order()],next:[],timezone:'Asia/Dubai'}:name==='needs_attention'?{suggested_jobs:2,unread_messages:1,unread_notifications:3}:name==='my_fixes'?{data:[{...order(),outcome_label:'Temporary fix'}],summary:{month:13,last_month:2,total:15}}:name==='list_messages'?{data:[]}:name==='list_suggestions'?{data:[]}:name==='list_leave_requests'?[]:name==='get_schedule'?{people:[{user_id:ravi,name:'Ravi',role:'technician'}],jobs:[],away:[]}:{data:[order()],total:18}}}));
});
it('Arabic late jobs are a no AI reply with file words and a local date, preserving data',async()=>{
 state.language='ar-AE';const result=await ask('شو الشغل المتأخر اليوم؟');
 expect(result.reply).toContain('المهام المتأخرة: 18');expect(result.reply).toContain('Repair entry door closer');expect(result.reply).toContain('Harbor Annex');expect(result.reply).toContain('أكتوبر');expect(result.reply).not.toContain('In Progress');expect(state.ai).not.toHaveBeenCalled();
 expect(await dataAnswer(c,'شو الشغل المتأخر اليوم؟')).toBe(result.reply);
});
it.each(LANGUAGES.filter(l=>!l.code.startsWith('en')).map(l=>l.code))('every quick path uses file words in %s',async language=>{
 state.language=language;
 for(const question of ['My fixes','Which jobs are late?','Show jobs waiting on parts','My jobs today','My next job','Who is free tomorrow?','What needs attention?','Show unread messages','How are my requests going?','When is my next visit?']){
  const reply=await quickAnswer(c,question,{role:question.includes('request')||question.includes('next visit')?'client':'admin',language,tomorrow:'2026-10-23',timezone:'Asia/Dubai'});
  expect(reply,question).toBeTruthy();expect(reply).not.toMatch(/You have|jobs are|Your next|In Progress|Every technician|Visit booked/);
 }
 for(const question of ['Show messages','Show suggestions','Show leave requests']){const reply=await dataAnswer(c,question);expect(reply).not.toMatch(/You have|Time off requests|Waiting for review/);}
 expect(state.ai).not.toHaveBeenCalled();
});
it.each([['owner','admin'],['admin','admin'],['supervisor','staff']])('%s receives an assignment card even with providers unavailable, including tomorrow',async (_viewer,role)=>{
 state.role=role;const before=state.scheduled;const result=await ask('Assign WO 3 to Ravi tomorrow');
 expect(result.pending_action).toMatchObject({tool:'assign_work_order',args:{id,assignee_id:ravi}});
 const date=new Date(result.pending_action.args.scheduled_for);
 expect(date.getTime()).toBeGreaterThan(Date.now());expect(date.toISOString().slice(11,16)).toBe('08:00');expect(result.pending_action.summary).toContain('Visit:');expect(result.pending_action.summary).toContain('12:00');expect(state.scheduled).toBe(before);
 expect(state.ai).not.toHaveBeenCalled();expect(state.tool.mock.calls.some(([,name])=>name==='assign_work_order')).toBe(false);
});
it('asks one short question when a dated assignment has no existing visit time',async()=>{
 state.scheduled='';const result=await ask('Assign WO 3 to Ravi tomorrow');expect(result.reply).toBe('What visit date and time should I use?');expect(result.pending_action).toBeUndefined();expect(state.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO assistant_actions'))).toBe(false);
});
it('a model assignment cannot drop a named date',async()=>{
 state.ai.mockResolvedValue({calls:[{id:'call',name:'assign_work_order',args:{id,assignee_id:ravi,updated_at:'2026-10-22T08:00:00Z'}}]});
 const result=await ask('Please assign this job to Ravi tomorrow morning');expect(result.reply).toBe('What visit date and time should I use?');expect(result.pending_action).toBeUndefined();
});
it('Arabic counts bypass model markdown and cheer',async()=>{
 state.language='ar-AE';state.ai.mockResolvedValue({text:'Ravi خلص **١٣** شغلة هالشهر. موفق!',calls:[]});const r=await ask('كم شغلة خلص Ravi هالشهر؟');expect(r.reply).toContain('Ravi');expect(r.reply).toContain('13');expect(r.reply).not.toMatch(/\*|موفق/);expect(state.ai).not.toHaveBeenCalled();
});
it.each(LANGUAGES.map(l=>l.code))('model count calls return factual fixed words in %s',async language=>{
 state.language=language;state.ai.mockResolvedValueOnce({calls:[{id:'count',name:'job_counts',args:{person:'Ravi'}}]}).mockResolvedValue({text:'**13**. Good luck!',calls:[]});
 const result=await ask('Tell me the completed work total for Ravi');expect(result.reply).toContain('Ravi');expect(result.reply).not.toMatch(/\*|Good luck|موفق/);expect(state.ai).toHaveBeenCalledTimes(1);
 expect(choiceWords(language)('What visit date and time should I use?')).toBeTruthy();
});
it('plain text strips markdown in every script',()=>{
 expect(plainAssistantReply('**١٣** و **13** و _عمل_')).toContain('١٣ و 13');expect(plainAssistantReply('# Count\n**13** `jobs`')).toBe('Count\n13 jobs');
});
it('keeps restricted roles out of the provider independent assignment path',async()=>{
 const {assignmentRequest}=await import('../lib/agent/assignment-request');
 for(const [role,office] of [['technician',false],['client',false],['staff',true]] as const){expect(await assignmentRequest(c,'Assign WO 3 to Ravi tomorrow',role,office,'Asia/Dubai')).toBeNull();}
 expect(state.tool).not.toHaveBeenCalled();
});
it('includes Saturday on the card',async()=>{
 const result=await ask('Give WO 3 to Ravi on Saturday');expect(result.pending_action.tool).toBe('assign_work_order');expect(new Date(result.pending_action.args.scheduled_for).getUTCDay()).toBe(6);expect(result.pending_action.summary).toContain('Visit:');
});
it('an ambiguous person never gets a guessed assignment card',async()=>{
 state.tool.mockImplementation(async(_c:unknown,name:string)=>({structuredContent:{result:name==='list_team'?[{user_id:ravi,name:'Ravi Kumar'},{user_id:user,name:'Ravi Patel'}]:order()}}));
 const result=await ask('Assign WO 3 to Ravi tomorrow');expect(result.pending_action).toBeUndefined();expect(state.ai).toHaveBeenCalled();
});
