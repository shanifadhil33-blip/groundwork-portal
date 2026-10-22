import { afterEach,beforeEach,expect,it,vi } from 'vitest';
const state=vi.hoisted(()=>({turn:vi.fn(),call:vi.fn(),actions:new Map<string,any>(),order:{id:'50000000-0000-4000-8000-000000000058',order_number:58,title:'Test access control reader',status:'scheduled',priority:'normal',timezone:'Asia/Dubai',due_on:'2026-11-10',scheduled_for:'2026-11-08T05:00:00Z'},role:'staff',kind:'manager',language:'en-IN',lengths:new Map<string,string>(),patch:vi.fn(),allowed:true,plan:vi.fn(),assignment:vi.fn()}));
vi.mock('../lib/db',()=>({withSystem:async(cb:(db:unknown)=>unknown)=>cb({query:async()=>({rows:[]})}),ownerPool:{query:async()=>({rows:[]})},appPool:{query:async()=>({rows:[]})},withUser:async(_u:unknown,cb:(db:unknown)=>unknown)=>cb({query:async()=>({rows:[]})}),asAgent:(_actor:unknown,callback:()=>unknown)=>callback()}));
vi.mock('../lib/services/day-plan',()=>({getDayPlan:state.plan,postDayPlan:vi.fn()}));
vi.mock('../lib/agent/assignment-request',()=>({assignmentRequest:state.assignment,namesVisitDate:()=>false}));
vi.mock('../lib/ai',()=>({assistantTurn:state.turn}));
vi.mock('../lib/services/settings',async original=>({...await original<typeof import('../lib/services/settings')>(),getPreferences:async(user:string)=>({agent_name:null,language:state.language,approval_mode:'ask',reply_length:state.lengths.get(user)??'normal'}),patchPreferences:state.patch}));
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
 list_work_orders:{write:false,description:'Jobs',schema:z.object({})},
 ask_choice:{write:false,description:'Ask',schema:z.object({question:z.string(),options:z.array(z.string())})},
 set_job_payment:{write:true,description:'Pay',schema:z.object({id:z.uuid(),payment_status:z.string()})},
 create_request:{write:true,description:'Request',schema:z.object({site_id:z.uuid(),title:z.string(),description:z.string().optional(),preferred_window:z.string().optional()})},
 }}});
vi.mock('../lib/services/demo-agent-limit',async original=>({...await original<typeof import('../lib/services/demo-agent-limit')>(),demoAgentAllowed:async()=>state.allowed}));
import { assistant } from '../lib/services/assistant';
import { UNANSWERED, UNAVAILABLE, INCOMPLETE, ACTION_LIMIT, failureWords } from '../lib/agent/failure-words';
import { choiceWords } from '../lib/agent/choices';
import { DEMO_REST } from '../lib/services/demo-agent-limit';
import { LANGUAGES } from '../lib/languages';
import { ApiError } from '../lib/http';
import { readFileSync } from 'node:fs';
const user='10000000-0000-4000-8000-000000000002',ws='20000000-0000-4000-8000-000000000001';
beforeEach(()=>{state.turn.mockReset();state.call.mockReset();state.actions.clear();state.lengths.clear();state.patch.mockReset();state.patch.mockImplementation(async(user:string,body:{reply_length:string})=>{state.lengths.set(user,body.reply_length);return body;});state.assignment.mockReset();state.assignment.mockResolvedValue(null);state.plan.mockReset();state.allowed=true;state.role='staff';state.kind='manager';state.language='en-IN';state.call.mockResolvedValue({content:[{type:'text',text:'{}'}],structuredContent:{result:{...state.order}}});});

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(()=>{warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);});
afterEach(()=>vi.restoreAllMocks());
const ask=()=>assistant(user,ws,{messages:[{role:'user',content:'رتب لي شغل بكرة'}]});
const languages=LANGUAGES.filter(l=>!l.code.startsWith('en'));
it.each(languages)('$code: exhausted providers answer directly from the shipped file',async({code})=>{
 state.language=code;state.turn.mockResolvedValue(null);
 const r=await ask();
 expect(r).toMatchObject({available:true,reply:choiceWords(code)(UNANSWERED),localized:true});
 expect((r as {reply:string}).reply).not.toBe(UNANSWERED);
 expect(state.call).not.toHaveBeenCalled();expect(state.actions.size).toBe(0);
});
it.each(languages)('$code: demo quota uses the shipped file and makes no AI call',async({code})=>{
 state.language=code;state.allowed=false;
 expect(await ask()).toMatchObject({reply:choiceWords(code)(DEMO_REST),localized:true,demo_rest:true});
 expect(state.turn).not.toHaveBeenCalled();expect(state.call).not.toHaveBeenCalled();
 expect(warn).toHaveBeenCalledWith('[assistant] fallback',expect.objectContaining({stage:'demo_limit'}));
});
it.each([
 ['provider',new Error('private provider response')],
 ['quota',Object.assign(new Error('private quota response'),{status:429})],
 ['timeout',Object.assign(new Error('private timeout response'),{name:'TimeoutError'})],
])('%s failures are localized and logged without raw exception details',async(_kind,error)=>{
 state.language='ar-AE';state.turn.mockRejectedValue(error);
 expect(await ask()).toMatchObject({reply:choiceWords('ar-AE')(UNANSWERED),localized:true});
 expect(warn).toHaveBeenCalledWith('[assistant] fallback',expect.objectContaining({stage:'turn',reason:_kind==='provider'?'error':_kind}));
 expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private/);
 expect(state.call).not.toHaveBeenCalled();
});
it('empty model replies use the same localized fallback',async()=>{
 state.language='ar-AE';state.turn.mockResolvedValue({calls:[],text:''});
 expect(await ask()).toMatchObject({reply:choiceWords('ar-AE')(UNANSWERED),localized:true});
});
it('the action loop limit is localized without increasing its budget',async()=>{
 state.language='ar-AE';state.turn.mockResolvedValue({calls:[{id:'read',name:'list_work_orders',args:{}}]});
 expect(await ask()).toMatchObject({reply:choiceWords('ar-AE')(ACTION_LIMIT),localized:true});
 expect(state.turn).toHaveBeenCalledTimes(10);
});
it('confirmation errors keep their status and use safe language file text',async()=>{
 state.language='ar-AE';
 await expect(assistant(user,ws,{messages:[],confirm_action_id:'60000000-0000-4000-8000-000000000001'})).rejects.toMatchObject({status:404,message:failureWords('ar-AE',new ApiError(404,'not_found',"We couldn't find that, or you don't have access.").message)});
});
it('every fallback sentence exists in all language files',()=>{
 for(const {code} of languages){
  const file=JSON.parse(readFileSync(`public/i18n/${code}.json`,'utf8'));
  for(const source of [UNANSWERED,UNAVAILABLE,INCOMPLETE,ACTION_LIMIT,DEMO_REST,'Stopped. Ask again when you are ready.']){
   expect(file[source],`${code}: ${source}`).toBeTruthy();expect(file[source]).not.toBe(source);
  }
 }
});
it('unknown error text never appears in any language, including English',()=>{
 for(const code of ['en-IN',...languages.map(l=>l.code)])expect(failureWords(code,'private exception')).toBe(choiceWords(code)(UNAVAILABLE));
});

it.each(languages)('$code: planned action failures use shipped words',async({code})=>{
 state.language=code;state.plan.mockRejectedValue(new Error('private planned failure'));
 const r=await assistant(user,ws,{messages:[{role:'user',content:"today's plan"}]});
 expect(r).toMatchObject({reply:choiceWords(code)(UNANSWERED),localized:true});
 expect(state.turn).not.toHaveBeenCalled();
 expect(warn).toHaveBeenCalledWith('[assistant] fallback',expect.objectContaining({stage:'planned'}));
 expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private/);
});
it('the total turn deadline uses shipped words and never starts an AI call',async()=>{
 state.language='ar-AE';
 const now=Date.now();const time=vi.spyOn(Date,'now').mockReturnValue(now);
 state.assignment.mockImplementation(async()=>{time.mockReturnValue(now+39_000);return null;});
 expect(await ask()).toMatchObject({reply:choiceWords('ar-AE')(UNANSWERED),localized:true});
 expect(state.turn).not.toHaveBeenCalled();
 expect(warn).toHaveBeenCalledWith('[assistant] fallback',expect.objectContaining({stage:'deadline'}));
});
