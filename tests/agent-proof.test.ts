vi.mock('../lib/services/company-memory',()=>({companyMemoryContext:async()=>[]}));
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({role:'admin',language:'en-IN',office:false,weekly:false,leave:null as string|null,next:'2026-10-25',person:'Ravi',forceModel:false,pending:null as any,query:vi.fn(),ai:vi.fn(),tool:vi.fn(),scheduled:'2026-10-01T08:00:00Z'}));
const user='10000000-0000-4000-8000-000000000001',ws='20000000-0000-4000-8000-000000000001',id='50000000-0000-4000-8000-000000000001',ravi='10000000-0000-4000-8000-000000000003';
const order=()=>({id,order_number:3,title:'Repair entry door closer',status:'in_progress',site_name:'Harbor Annex',due_on:'2026-10-20',priority:'normal',scheduled_for:state.scheduled,updated_at:'2026-10-22T08:00:00Z',timezone:'Asia/Dubai',assignee_id:ravi});
vi.mock('../lib/agent/assignment-request',async original=>{const actual=await original<typeof import('../lib/agent/assignment-request')>();return {...actual,assignmentRequest:(...args:Parameters<typeof actual.assignmentRequest>)=>state.forceModel?null:actual.assignmentRequest(...args)};});
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
vi.mock('../lib/services/contact-names',()=>({listContactNames:async()=>[{user_id:ravi,name:state.person}]}));
vi.mock('../lib/services/client-visits',async original=>({...await original<typeof import('../lib/services/client-visits')>(),selectedVisitChoice:async()=>null}));
vi.mock('../lib/agent/tools',async original=>({...await original<typeof import('../lib/agent/tools')>(),callTool:state.tool}));
import { assistant, unansweredAsk } from '../lib/services/assistant';
import { namesVisitDate } from '../lib/agent/assignment-request';
import { detectIntent, quickLookup, dataAnswer, quickAnswer } from '../lib/agent/data-answers';
import { plainAssistantReply } from '../lib/ui/assistant-replies';
import { LANGUAGES } from '../lib/languages';
import { choiceWords } from '../lib/agent/choices';
const c={user,ws,scope:'read' as const,kind:'assistant' as const};
const ask=(content:string)=>assistant(user,ws,{messages:[{role:'user',content}]}) as Promise<any>;
beforeEach(()=>{
 vi.clearAllMocks();state.role='admin';state.office=false;state.language='en-IN';state.scheduled='2026-10-01T08:00:00Z';state.weekly=false;state.leave=null;state.next='2026-10-25';state.person='Ravi';state.forceModel=false;state.pending=null;
 state.ai.mockResolvedValue(null);
 state.query.mockImplementation(async(sql:string,values:any[])=>{
  if(sql.includes('FROM assistant_actions'))return {rows:state.pending?[state.pending]:[]};
  if(sql.includes('INSERT INTO assistant_actions')){
   state.pending={id:'60000000-0000-4000-8000-000000000001',tool:values[2],args:JSON.parse(values[3]),expires_at:'2026-10-23T08:00:00Z'};
   return {rows:[{id:state.pending.id}]};
  }
  if(sql.includes("time '09:00'"))return {rows:[{value:new Date(`${values[0]}T05:00:00Z`)}]};
  if(sql.includes('AS weekly'))return {rows:[{weekly:state.weekly,kind:state.leave,name:state.person}]};
  if(sql.includes('WITH anchors'))return {rows:[{d:state.next}]};
  if(sql.includes('$1::timestamptz AT TIME ZONE timezone)::date'))return {rows:[{d:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(values[0]))}]};
  if(sql.includes('SELECT language'))return {rows:[{language:state.language}]};
  if(sql.includes('SELECT name FROM visible_user'))return {rows:[{name:values[0]===ravi?state.person:'Imran'}]};
  return {rows:[{timezone:'Asia/Dubai',currency:'AED',approval_mode:'important',extra_roles:[],name:'Imran',d:'2026-10-23'}]};
 });
 state.tool.mockImplementation(async(_c:unknown,name:string)=>({structuredContent:{result:name==='job_counts'?{name:'Ravi',month:13,total:13}:name==='get_work_order_by_number'?order():name==='list_team'?[{user_id:ravi,name:state.person}]:name==='my_day'?{today:[order()],late:[order()],next:[],timezone:'Asia/Dubai'}:name==='needs_attention'?{suggested_jobs:2,unread_messages:1,unread_notifications:3}:name==='my_fixes'?{data:[{...order(),outcome_label:'Temporary fix'}],summary:{month:13,last_month:2,total:15}}:name==='list_messages'?{data:[]}:name==='list_suggestions'?{data:[]}:name==='list_leave_requests'?[]:name==='get_schedule'?{people:[{user_id:ravi,name:'Ravi',role:'technician'}],jobs:[],away:[]}:{data:[order()],total:18}}}));
});
it('Arabic late jobs are a no AI reply with file words and a local date, preserving data',async()=>{
 state.language='ar-AE';const result=await ask('شو الشغل المتأخر اليوم؟');
 expect(result.reply).toContain('المهام المتأخرة: 18');expect(result.reply).toContain('Repair entry door closer');expect(result.reply).toContain('Harbor Annex');expect(result.reply).toContain('أكتوبر');expect(result.reply).not.toContain('In Progress');expect(state.ai).not.toHaveBeenCalled();
 expect(result).toMatchObject({quick:true,localized:true});
 expect(result.reply).toContain(choiceWords('ar-AE')('Highest priority first, then oldest deadline'));
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
 state.scheduled='';const result=await ask('Assign Job #3 to Ravi tomorrow');expect(result.reply).toBe('What visit date and time should I use?');expect(result.pending_action).toBeUndefined();expect(state.query.mock.calls.some(([sql])=>sql.includes('INSERT INTO assistant_actions'))).toBe(false);
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
 for(const [role,office] of [['technician',false],['client',false],['staff',true]] as const){expect(await assignmentRequest(c,'Assign Job #3 to Ravi tomorrow',role,office,'Asia/Dubai')).toBeNull();}
 expect(state.tool).not.toHaveBeenCalled();
});
it('includes Saturday on the card',async()=>{
 const result=await ask('Give Job #3 to Ravi on Saturday');expect(result.pending_action.tool).toBe('assign_work_order');expect(new Date(result.pending_action.args.scheduled_for).getUTCDay()).toBe(6);expect(result.pending_action.summary).toContain('Visit:');
});
it('an ambiguous person never gets a guessed assignment card',async()=>{
 state.tool.mockImplementation(async(_c:unknown,name:string)=>({structuredContent:{result:name==='list_team'?[{user_id:ravi,name:'Ravi Kumar'},{user_id:user,name:'Ravi Patel'}]:order()}}));
 const result=await ask('Assign Job #3 to Ravi tomorrow');expect(result.pending_action).toBeUndefined();expect(state.ai).toHaveBeenCalled();
});

afterEach(()=>vi.useRealTimers());
const refusal=()=>choiceWords(state.language)('{name} cannot take a job that day. His next free day is {day}.').replace('{name}','Anil').replace('{day}',new Intl.DateTimeFormat(state.language==='tw'?'ak':state.language,{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${state.next}T00:00:00Z`)));
function saturdayCase(){
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-22T08:00:00Z'));
 state.person='Anil';state.scheduled='2026-10-23T12:00:00Z';
 state.ai.mockResolvedValue({calls:[{id:'assign',name:'assign_work_order',args:{id,assignee_id:ravi,scheduled_for:'2026-10-24T12:00:00Z',updated_at:'2026-10-22T08:00:00Z'}}]});
}
it.each([false,true])('refuses Imran giving WO 3 to Anil on Saturday before any card, model path %s',async model=>{
 saturdayCase();state.weekly=true;state.forceModel=model;
 const result=await ask('Give WO 3 to Anil on Saturday');
 expect(result).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.query).toHaveBeenCalledWith(expect.stringContaining('AS weekly'),[ws,ravi,'2026-10-24']);
 expect(state.pending).toBeNull();
 expect(state.tool.mock.calls.some(([,name])=>name==='assign_work_order')).toBe(false);
 expect(state.ai).toHaveBeenCalledTimes(model?1:0);
});
it.each(LANGUAGES.map(l=>l.code))('refuses a model proposal during approved leave in %s with nothing pending',async language=>{
 saturdayCase();state.forceModel=true;state.language=language;state.leave='leave';state.next='2026-10-26';
 const result=await ask('Give WO 3 to Anil on Saturday');
 expect(result).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.pending).toBeNull();expect(state.ai).toHaveBeenCalledTimes(1);
});
it.each(['weekly','leave'])('refuses confirmation when %s availability changed after the card',async reason=>{
 saturdayCase();
 const proposed=await ask('Give WO 3 to Anil on Saturday');
 expect(proposed.pending_action.args.scheduled_for).toBe('2026-10-24T12:00:00.000Z');
 expect(proposed.pending_action.summary).toContain('16:00');
 state.weekly=reason==='weekly';state.leave=reason==='leave'?'leave':null;state.language='ar-AE';
 state.tool.mockClear();
 const result=await assistant(user,ws,{messages:[],confirm_action_id:proposed.pending_action.id});
 expect(result).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.tool).not.toHaveBeenCalled();expect(state.ai).not.toHaveBeenCalled();
 expect(state.query).toHaveBeenCalledWith(expect.stringContaining("outcome='refused'"),[proposed.pending_action.id,refusal()]);
});
it('uses the workspace Saturday when a model timestamp is still Friday in UTC',async()=>{
 saturdayCase();state.forceModel=true;state.weekly=true;
 state.ai.mockResolvedValue({calls:[{id:'assign',name:'assign_work_order',args:{id,assignee_id:ravi,scheduled_for:'2026-10-23T21:00:00Z',updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(await ask('Give Job #3 to Anil on Saturday')).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.query).toHaveBeenCalledWith(expect.stringContaining('AS weekly'),[ws,ravi,'2026-10-24']);
 expect(state.pending).toBeNull();
});
it('checks the current assignee when the model proposes moving a visit during leave',async()=>{
 saturdayCase();state.forceModel=true;state.leave='leave';
 state.ai.mockResolvedValue({calls:[{id:'move',name:'update_work_order_dates',args:{id,scheduled_for:'2026-10-24T12:00:00Z',updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(await ask('Move Job #3 to Saturday')).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.pending).toBeNull();
});
it('checks the existing visit when a model assignment omits a new visit time',async()=>{
 saturdayCase();state.forceModel=true;state.weekly=true;state.scheduled='2026-10-23T21:00:00Z';
 state.ai.mockResolvedValue({calls:[{id:'assign',name:'assign_work_order',args:{id,assignee_id:ravi,updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(await ask('Give Job #3 to Anil')).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.pending).toBeNull();
});

it('allows a model assignment on a working day without saving the job',async()=>{
 saturdayCase();state.forceModel=true;
 const result=await ask('Give WO 3 to Anil on Saturday');
 expect(result.pending_action.args.scheduled_for).toBe('2026-10-24T12:00:00Z');
 expect(result.pending_action.summary).toContain('16:00');
 expect(state.tool.mock.calls.some(([,name])=>name==='assign_work_order')).toBe(false);
});
it('checks a date only visit at the same workspace time used when saving',async()=>{
 saturdayCase();state.forceModel=true;state.weekly=true;
 state.ai.mockResolvedValue({calls:[{id:'move',name:'update_work_order_dates',args:{id,scheduled_for:'2026-10-24',updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(await ask('Move Job #3 to Saturday')).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.query).toHaveBeenCalledWith(expect.stringContaining("time '09:00'"),['2026-10-24',ws]);
 expect(state.pending).toBeNull();
});
it.each([{due_on:'2026-10-24'},{scheduled_for:null},{clear_visit:true}])('preserves date changes that do not book a visit: %j',async data=>{
 saturdayCase();state.forceModel=true;state.weekly=true;
 state.ai.mockResolvedValue({calls:[{id:'dates',name:'update_work_order_dates',args:{id,...data,updated_at:'2026-10-22T08:00:00Z'}}]});
 const result=await ask('Change WO 3 dates');
 expect(result.pending_action.tool).toBe('update_work_order_dates');
 expect(state.query.mock.calls.some(([sql])=>sql.includes('AS weekly'))).toBe(false);
});


const gulfAssignments = ['عط WO 3 لـ Anil يوم السبت', 'عطي WO 3 لـ Anil السبت', 'خل WO 3 لـ Anil السبت', 'حوّل WO 3 لـ Anil السبت', 'سلّم WO 3 لـ Anil السبت', 'وزّع WO 3 لـ Anil السبت'];
const hindiUrduAssignments = ['WO 3 Anil को दो शनिवार', 'WO 3 Anil को सौंपो शनिवार', 'WO 3 Anil کو دو ہفتہ', 'WO 3 Anil کو دے دو ہفتہ'];
it.each([...gulfAssignments, ...hindiUrduAssignments])('explicit assignment reaches the same off day refusal without AI: %s', async question=>{
 saturdayCase();state.language=question.includes('को')?'hi':question.includes('کو')?'ur':'ar-AE';state.weekly=true;
 expect(detectIntent(question).intent).toBe('summary');expect(quickLookup(question)).toBeNull();expect(unansweredAsk(question)).toBe(true);
 expect(await ask(question)).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.query).toHaveBeenCalledWith(expect.stringContaining('AS weekly'),[ws,ravi,'2026-10-24']);
 expect(state.ai).not.toHaveBeenCalled();expect(state.pending).toBeNull();
 expect(state.tool.mock.calls.some(([,name])=>name==='assign_work_order')).toBe(false);
});
it.each([...gulfAssignments, ...hindiUrduAssignments])('a working day gives a confirmation card without writing: %s', async question=>{
 saturdayCase();const result=await ask(question);
 expect(result.pending_action).toMatchObject({tool:'assign_work_order',args:{id,assignee_id:ravi,scheduled_for:'2026-10-24T12:00:00.000Z'}});
 expect(state.ai).not.toHaveBeenCalled();expect(state.tool.mock.calls.some(([,name])=>name==='assign_work_order')).toBe(false);
});
it.each(['عط WO 3 لـ Anil يوم السبت', 'WO 3 لـ Anil يوم السبت', 'कृपया WO 3 Anil को सौंपो शनिवार', 'براہ کرم WO 3 Anil کو دے دو ہفتہ'])('model assignments use the same checks after resolving records: %s',async question=>{
 saturdayCase();state.forceModel=true;state.weekly=true;state.language='ar-AE';
 state.ai.mockReset();state.ai.mockResolvedValueOnce({calls:[{id:'read',name:'get_work_order_by_number',args:{number:3}},{id:'team',name:'list_team',args:{}}]}).mockResolvedValueOnce({calls:[{id:'assign',name:'assign_work_order',args:{id,assignee_id:ravi,scheduled_for:'2026-10-24T12:00:00Z',updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(await ask(question)).toEqual({available:true,reply:refusal(),localized:true});
 expect(state.ai).toHaveBeenCalledTimes(2);expect(state.ai.mock.calls[0][2]).toContain('عط Job #3 لـ Anil يوم السبت');expect(state.pending).toBeNull();
});
it.each(['حوّل WO 3 يوم السبت', 'WO 3 शनिवार तय करो', 'WO 3 ہفتہ شیڈول کرو', 'WO 3 शनिवार शेड्यूल कर दो', 'WO 3 ہفتہ شیڈول کر دو'])('visit changes reach availability checks: %s',async question=>{
 saturdayCase();state.weekly=true;state.language='ar-AE';
 state.ai.mockResolvedValue({calls:[{id:'move',name:'update_work_order_dates',args:{id,scheduled_for:'2026-10-24T12:00:00Z',updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(unansweredAsk(question)).toBe(true);expect(await ask(question)).toEqual({available:true,reply:refusal(),localized:true});expect(state.pending).toBeNull();
});
it.each([['اليوم','2026-10-22'],['بكرة','2026-10-23'],['الأحد','2026-10-25'],['الاثنين','2026-10-26'],['الثلاثاء','2026-10-27'],['الأربعاء','2026-10-28'],['الخميس','2026-10-29'],['الجمعة','2026-10-23']])('keeps the requested Gulf day and existing visit time: %s',async(day,date)=>{
 saturdayCase();const result=await ask(`عط WO 3 لـ Anil ${day}`);
 expect(result.pending_action.args.scheduled_for).toBe(`${date}T12:00:00.000Z`);expect(state.ai).not.toHaveBeenCalled();
});
it.each(['عط WO 3 لـ Anil اليوم', 'WO 3 Anil को दो आज', 'WO 3 Anil کو دو کل'])('a model may not discard the requested date: %s',async question=>{
 saturdayCase();state.forceModel=true;state.ai.mockResolvedValue({calls:[{id:'assign',name:'assign_work_order',args:{id,assignee_id:ravi,updated_at:'2026-10-22T08:00:00Z'}}]});
 expect(namesVisitDate(question)).toBe(true);expect((await ask(question)).reply).toBe('What visit date and time should I use?');expect(state.pending).toBeNull();
});
it.each(['WO 3', 'اعرض WO 3', 'WO 3 दिखाओ', 'WO 3 دکھاؤ', 'معلومات حول WO 3', 'Give me details for WO 3'])('read requests still identify the job: %s',question=>{
 expect(detectIntent(question)).toEqual({intent:'job',number:3});expect(unansweredAsk(question)).toBe(false);
});
it('keeps translated read questions on the no AI path',async()=>{
 for(const language of ['ar-AE','hi','ur']){
  state.language=language;const result=await ask(choiceWords(language)('Show my jobs today'));
  expect(result.quick).toBe(true);
 }
 expect(state.ai).not.toHaveBeenCalled();
});

it.each(['السبت؟','بكرة.','आज।','کل؟'])('recognizes a requested date beside punctuation: %s',day=>{
 expect(namesVisitDate(`Job #3 Anil ${day}`)).toBe(true);
});
