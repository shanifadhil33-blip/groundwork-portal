import { prepareQuoteVisit, confirmQuoteVisit, quoteVisitFromWords } from './quote-visits';
import { agentTradeWordsPrompt } from '../trade-words';
import { readEvidenceAnswer } from '../agent/read-evidence-answer';
import { operationalAnswer, operationalIntent } from '../agent/operational-answers';
import { selectAssistantTools } from '../agent/prompt-tools';
import { assignmentIntent, ASSIGNMENT_PROMPT } from '../agent/assignment-intent';
import { assignmentRequest, namesVisitDate } from '../agent/assignment-request';
import { countLine } from '../count-lines';
import { groundedReply } from '../agent/reply-grounding';
import { choicePrompt, choiceWords, localizedChoice } from '../agent/choices';
import { PRACTICE_NOTICE, PRACTICE_CODE, practiceJoinUrl } from '../identity-rehearsal';
import { demoAgentAllowed, DEMO_REST } from './demo-agent-limit';
import { confirmPlanned, planFromWords } from './planned';
import { quickJobStep, confirmJobNextStep } from './job-next-step';
import { listWords,resolveWords } from './agent-words';
import { ownerToolPower, ownerCan, OWNER_REFUSAL } from './owner';
import { householdIntake, confirmHousehold } from './household';
import { replyLengthPrompt } from '../agent/replylength';
import { detectPersonalSetting, settingUndo, settingRestored, isSettingReceipt, settingRefusal } from '../agent/personalsettings';
import { setMySetting } from './personalsettings';
import { prepareClientVisit, visitSlotChoices, selectedVisitChoice } from './client-visits';
import { reportEmergency } from './emergencies';
import { noteTargets } from '../agent/note-target';
import { fixJobTitles, jobsSeen } from '../agent/job-labels';
import { safetyLine } from '../emergency';
import { brokenReply, detectIntent, quickLookup, quickAnswer, countAnswer, clientCountQuestion, topClientsQuestion } from '../agent/data-answers';
/** Audit A10: when the AI is out, a request to do something must say nothing changed, not answer with an unrelated summary. */
import { UNANSWERED, UNAVAILABLE, ACTION_LIMIT, failureWords } from '../agent/failure-words';
import { logAssistantFailure } from '../agent/failure-log';
export { UNANSWERED } from '../agent/failure-words';
export function unansweredAsk(q:string){if(assignmentIntent(q))return true;if(/\b(?:assign|cancel|withdraw|move|reschedule|approve|decline|delete|remove|change|mark|send|book|create|start|stop|reopen|confirm|accept|reject|pay)\w*\b/i.test(q))return true;return !!q.trim()&&detectIntent(q).intent==='summary'&&!/^\s*(?:hi|hello|hey|salam|good (?:morning|afternoon|evening)|what(?:'s| is) (?:new|up|waiting)|help|summary|thanks?|thank you|ok(?:ay)?)\b/i.test(q);}
import { listContactNames } from './contact-names';
import { explicitClientComment } from '../ui/comments';
import { z } from 'zod';
import { offSpan,actionSummary,actionResult,plainAssistantReply,withCurrency,audienceStatusReply,recordResult,recordSummary,recordTools } from '../ui/assistant-replies';
import { asAgent,withSystem } from '../db';
import type { RefusalOffer } from '../ui/agent-offers';
import { getPreferences } from './settings';
import { LANGUAGES } from '../languages';
import { assistantTurn,type AssistantMessage,type AssistantTurn } from '../ai';
import { ApiError,missing } from '../http';
import { inWorkspace,uuid,type Context } from './shared';
import { getWorkOrder } from './work-orders';
import { assertWorking } from './time-off';
import { listAgentLearning } from './agent-learning';
import { needsAttention, attentionReply } from './attention';
import { tools,callTool,datesAsked,type AgentContext } from '../agent/tools';
import { allowedTool, ADMIN_ONLY } from '../agent/role-tools';
import { jobSnapshot,logRefusal,recordSnapshot,REFUSAL_REASON,whyNote } from './agent-log';
import { contractNote,contractUse } from './payments';
/** The client or site a record write touches: its name for the card, and the current values to show what changes. */
/** The record a client or site tool acts on, with the country its labels and formats follow. */
const teamTools=['assign_work_order','set_job_trade','set_worker_skills','add_worker','set_member_roles','decide_time_off'];
/** What a memory change does, for the why note (the card already shows the words). */
const MEMORY_EFFECT:Record<string,string>={remember_about_me:'It goes on your Memory page and is used only when helping you.',forget_about_me:'It comes off your Memory page and is not used again.',set_call_me:'The Agent calls you by this name from now on.'};
function savedNoteReply(name:string,order:{id:string;order_number:number;title:string}){
 const jobLink=`/work-orders/${order.id}`;
 return `Done${name?`, ${plainAssistantReply(name)}`:''}. I saved your note on WO ${order.order_number} ${plainAssistantReply(order.title)}. [Open job](${jobLink})`;
}
/** The person a team action is about, by name, for the confirmation card. */
async function personLabel(x:{user?:string;db:{query:(q:string,v:unknown[])=>Promise<{rows:any[]}>}},ws:string,tool:string,args:any):Promise<string|undefined>{
 if(tool==='add_worker')return String(args.name??'');
 const id=tool==='assign_work_order'?args.assignee_id:tool==='set_worker_skills'||tool==='set_member_roles'?args.user_id:null;
 if(!id)return tool==='assign_work_order'?'nobody':undefined;
 if(x.user){const named=(await listContactNames(x.user,ws)).find(p=>p.user_id===id);if(named)return named.name;}
 return (await x.db.query('SELECT u.name FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true WHERE m.workspace_id=$1 AND m.user_id=$2',[ws,id])).rows[0]?.name??'Team member';
}
async function recordTarget(x:{db:{query:(q:string,v:unknown[])=>Promise<{rows:any[]}>}},ws:string,tool:string,args:any){
 const home=(await x.db.query('SELECT country FROM workspaces WHERE id=$1',[ws])).rows[0]?.country as string;
 if(tool==='add_asset'){const r=(await x.db.query('SELECT name FROM sites WHERE workspace_id=$1 AND id=$2',[ws,args.site_id])).rows[0];if(!r)throw missing();return {label:r.name as string,record:null,country:home};}
 if(tool==='create_client')return {label:args.name as string,record:null,country:(args.country as string)||home};
 if(tool==='update_client'){const r=(await x.db.query('SELECT * FROM clients WHERE workspace_id=$1 AND id=$2',[ws,args.id])).rows[0];if(!r)throw missing();return {label:r.name as string,record:r,country:(args.country===undefined?r.country:args.country)||home};}
 if(tool==='create_site'){const r=(await x.db.query('SELECT name,country FROM clients WHERE workspace_id=$1 AND id=$2',[ws,args.client_id])).rows[0];if(!r)throw missing();return {label:r.name as string,record:null,country:r.country||home};}
 const r=(await x.db.query('SELECT s.*,c.name AS client_name,c.country AS client_country FROM sites s JOIN clients c ON c.id=s.client_id AND c.workspace_id=s.workspace_id WHERE s.workspace_id=$1 AND s.id=$2',[ws,args.id])).rows[0];if(!r)throw missing();return {label:`${r.name} (${r.client_name})`,record:r,country:r.client_country||home};
}
export const assistantUnavailable={available:false,message:UNAVAILABLE};
/** Check the proposed values, including the existing visit or assignee when omitted. */
async function availabilityRefusal(x:Context,tool:string,args:Record<string,any>,order:any){
 if(!order||!['assign_work_order','update_work_order_dates'].includes(tool))return null;
 const data=tool==='update_work_order_dates'?datesAsked(args):args;
 if(!('assignee_id' in data)&&!('scheduled_for' in data))return null;
 const assignee='assignee_id' in data?data.assignee_id:order.assignee_id;
 let visit='scheduled_for' in data?data.scheduled_for:order.scheduled_for;
 // Match the date only visit conversion used when saving the job.
 if(typeof visit==='string'&&visit.length===10)visit=(await x.db.query("SELECT ($1::date + time '09:00') AT TIME ZONE timezone AS value FROM workspaces WHERE id=$2",[visit,x.ws])).rows[0].value;
 try{await assertWorking(x,assignee,visit);}
 catch(e){if(e instanceof ApiError&&e.status===422&&e.fields?.assignee_id)return e.message;throw e;}
 return null;
}
const schema=z.object({messages:z.array(z.object({role:z.enum(['user','assistant']),content:z.string().min(1).max(20000)}).strict()).max(30),confirm_action_id:uuid.optional(),household_photo_ids:z.array(uuid).max(4).optional()}).strict();
export async function assistant(user:string,ws:string,body:unknown) {
 try { return await assistantRequest(user,ws,body); }
 catch(error) {
  logAssistantFailure('request',error);
  const language=(await getPreferences(user)).language;
  if(error instanceof z.ZodError)throw new ApiError(422,'validation',failureWords(language,'Check the highlighted fields and try again.'));
  if(error instanceof ApiError)throw new ApiError(error.status,error.code,failureWords(language,error.message));
  throw new ApiError(500,'internal',failureWords(language));
 }
}
async function assistantRequest(user:string,ws:string,body:unknown) {
 const until=Date.now()+38_000;
 const input=schema.parse(body);
 if(input.confirm_action_id){
  const own=await inWorkspace(user,ws,async c=>(await c.db.query("SELECT tool FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3",[ws,user,input.confirm_action_id])).rows[0]);
  if(own?.tool==='job_next_step')return confirmJobNextStep(user,ws,input.confirm_action_id);
  if(own?.tool==='issue_phone_code'||own?.tool==='set_usual_context'||own?.tool==='sign_off'||own?.tool==='approve_day_plan'||own?.tool==='remember_rule')return confirmPlanned(user,ws,input.confirm_action_id);
 }
 if(!input.confirm_action_id){
  const words=input.messages.filter(m=>m.role==='user').at(-1)?.content??'';
  const jobStep=await quickJobStep(user,ws,words);if(jobStep)return jobStep;
  const emergency=await reportEmergency(user,ws,words);
  if(emergency)return emergency;
  const planned=await planFromWords(user,ws,words);if(planned)return planned;
  const quoteVisit=await quoteVisitFromWords(user,ws,input.messages);if(quoteVisit)return quoteVisit;
  const intake=await householdIntake(user,ws,input.messages,input.household_photo_ids);
  if(intake)return intake;
 }
 // DEMO14: a question that needs the AI in a demo sandbox counts toward the demo limit; over it, a friendly note.
 if(!input.confirm_action_id&&(await demoAgentAllowed(ws))===false){logAssistantFailure('demo_limit');const word=choiceWords((await getPreferences(user)).language);const sl=safetyLine(input.messages.filter(m=>m.role==='user').at(-1)?.content);const reply=word(DEMO_REST);return {available:true,reply:sl?`${word(sl)}\n\n${reply}`:reply,demo_rest:true,localized:true};}
 const offers:RefusalOffer[]=[];
 const result=await assistantInner(user,ws,body,offers,until);
 if(!offers.length)await refusedOnItsOwn(user,ws,body,result,offers).catch(()=>undefined);
 const r=offers.length?{...result,offers,...(result&&typeof result==='object'&&typeof (result as {reply?:unknown}).reply==='string'?{reply:offerReply((result as {reply:string}).reply,offers)}:{})}:result;
 const last=(body as {messages?:{role:string;content:string}[]})?.messages?.filter(m=>m.role==='user').at(-1)?.content;
 const sos=(body as {confirm_action_id?:string})?.confirm_action_id?null:safetyLine(last);
 if(sos&&r&&typeof r==='object'&&'reply' in r&&typeof (r as {reply?:unknown}).reply==='string'){
  const line=(r as {localized?:boolean}).localized?choiceWords((await getPreferences(user)).language)(sos):sos;
  if(!(r as {reply:string}).reply.startsWith(line))return {...r,reply:`${line}\n\n${(r as {reply:string}).reply}`};
 }
 if(sos&&r&&typeof r==='object'&&(r as {available?:boolean}).available===false)return {available:true,reply:sos};
 return r;
}
/** AGENT11: with an Ask button on screen the reply must not echo the app's own instructions to the model, and must not claim
 * a request was sent or will be sent: nothing goes out until the person taps the button. Otherwise the model's words stay. */
export function offerReply(reply:string,offers:{to_name:string}[]):string{
 const names=[...new Set(offers.map(o=>o.to_name))];if(!names.length)return reply;
 const fixed=names.length===1?`${names[0]} can make this change. Tap Ask ${names[0]} to send it.`:`${names.join(' and ')} can make these changes. Tap a button below to send each one.`;
 return !reply.trim()||/Ask button|Do not ask again|one short sentence|Nothing is sent yet|the app (?:shows|already)|\bI(?:'ll| will| have|'ve| am going to)? ?(?:ask(?:ed)?|sen[dt]|forward(?:ed)?) (?:it |this |the request )?(?:to )?(?:him|them|your|the|[A-Z])/.test(reply)?fixed:reply;
}
async function assistantInner(user:string,ws:string,body:unknown,offers:RefusalOffer[],until:number) {
 const d=schema.parse(body),c:AgentContext={user,ws,scope:'write',kind:'assistant',approved:!!d.confirm_action_id,actionKey:d.confirm_action_id};
 if(d.confirm_action_id)return asAgent({kind:'assistant'},()=>inWorkspace(user,ws,async x=>{
  const a=(await x.db.query('SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3 FOR UPDATE',[ws,user,d.confirm_action_id])).rows[0];
  if(!a)throw missing();
  if(a.consumed_at)throw new ApiError(409,'consumed','This action has already been confirmed.');
  if(a.declined_at)throw new ApiError(409,'declined','You said no to this one. Ask Agent again.');
  if(new Date(a.expires_at)<=new Date())throw new ApiError(409,'expired','This action has expired. Ask Agent again.');
  if(a.tool==='quote_visit')return confirmQuoteVisit(x,a);
  if(a.tool==='household_request')return confirmHousehold(x,a);
  // Shared services reuse this same app-role transaction: write and consume commit together.
  const previous=['report_price_change','report_client_refused','tick_job_step','add_job_material','reschedule_visit','cancel_visit','update_work_order_status','save_job_report','send_quote','answer_quote','confirm_visit','update_work_order_dates','set_priority','add_comment','assign_work_order','set_job_trade','set_job_payment'].includes(a.tool)?await getWorkOrder(user,ws,a.args.id??a.args.work_order_id):null;
  const unavailable=await availabilityRefusal(x,a.tool,a.args,previous);
  if(unavailable){
   await x.db.query("UPDATE assistant_actions SET consumed_at=now(),outcome='refused',reason=$2 WHERE id=$1",[a.id,unavailable]);
   return {available:true,reply:unavailable,localized:true};
  }
  const queueTarget=['approve_queue_row','reject_queue_row'].includes(a.tool)?(await x.db.query('SELECT row_number,data FROM import_rows WHERE workspace_id=$1 AND id=$2',[ws,a.args.row_id])).rows[0]:null;
  const record=recordTools.includes(a.tool)?await recordTarget(x,ws,a.tool,a.args):null;
  const person=a.tool==='decide_time_off'?undefined:teamTools.includes(a.tool)?await personLabel(x,ws,a.tool,a.args):undefined;
  const result=await callTool(c,a.tool,a.args);
  const value=result.structuredContent as {result?:any};
  if(value.result?.refused){await x.db.query("UPDATE assistant_actions SET consumed_at=now(),outcome='refused',reason=$2 WHERE id=$1",[a.id,value.result.reply]);return {available:true,reply:value.result.reply,logged:true};}
  const order=result.isError?null:previous??(['create_request','approve_queue_row'].includes(a.tool)?value.result:null);
  // Decision log: outcome, and for a new job its id so Undo can cancel it.
  const created=a.tool==='create_request'&&!result.isError&&value?.result?.order_number?{id:value.result.id}:null;
  // Decision log: the job or record as it is after the change, so the log shows what moved.
  let after:unknown=null;
  if(!result.isError){try{after=record?.record?recordSnapshot(a.tool,a.args,(await recordTarget(x,ws,a.tool,a.args)).record):previous?jobSnapshot(await getWorkOrder(user,ws,previous.id)):a.tool==='create_request'&&value?.result?.id?jobSnapshot(value.result):null;}catch{after=null;}}
  await x.db.query('UPDATE assistant_actions SET consumed_at=now(), outcome=$2, before=coalesce($3::jsonb,before), after=$4::jsonb WHERE id=$1',[a.id,result.isError?'failed':'done',created?JSON.stringify(created):null,after?JSON.stringify(after):null]);
  const first=a.tool==='set_call_me'?String(a.args?.name??'').trim():String((await x.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'').trim().split(/\s+/)[0];
  const plainNote=a.tool==='add_comment'&&(x.role==='technician'||x.role==='client'||x.role==='staff'&&x.staff_kind==='office');
  const noteName=plainNote?(await getPreferences(user)).preferred_name||first:first;
  const done=(t:string)=>result.isError?t:`Done${first?`, ${first}`:''}. ${t.replace(/^Done[.,!]?\s*/i,'')}`;
  if(a.tool==='add_worker'&&!result.isError&&value.result?.simulated)return {available:true,reply:`${PRACTICE_NOTICE}\n\n${PRACTICE_CODE}\n\n[Sign in preview](${practiceJoinUrl})`,result,logged:true};
  return {available:true,reply:result.isError?failureWords((await getPreferences(user)).language,plainAssistantReply(result.content[0].text,x.role==='client')):plainNote&&order?savedNoteReply(noteName,order):record?done(recordResult(a.tool,a.args,record)):done(audienceStatusReply(actionResult(a.tool,a.args,order,person??(queueTarget?`row ${queueTarget.row_number}: ${queueTarget.data.title}`:undefined)),x.role==='client')),result,logged:!result.isError};
 }));
 const question=d.messages.filter(m=>m.role==='user').at(-1)?.content.trim()??'';
 const words=await listWords(user,ws);
 const resolvedQuestion=resolveWords(question,words);
 const requestedSetting=detectPersonalSetting(question);
 const undoRequested=question==='Undo'&&d.messages.at(-2)?.role==='assistant'&&isSettingReceipt(d.messages.at(-2)!.content);
 if(requestedSetting||undoRequested){
  await inWorkspace(user,ws,async()=>undefined);
  const preferences=undoRequested?await getPreferences(user):null;
  const restored=undoRequested?settingUndo(d.messages,{...preferences,reply_length:preferences.reply_length??'normal'}):null;
  const next=requestedSetting??restored;
  if(next){
   const result=await setMySetting(user,next);
   if(restored&&result.setting_change)return {available:true,...result,reply:settingRestored(restored.setting,result.setting_change.value),choices:[]};
   return {available:true,...result};
  }
  return {available:true,reply:failureWords((await getPreferences(user)).language,'Your setting has since changed. Open your personal settings to choose it again.'),localized:true};
 }
 const readIntent=operationalIntent(resolvedQuestion);
 if(readIntent){const reply=await operationalAnswer(user,ws,readIntent,(await getPreferences(user)).language);return {available:true,reply,quick:true,localized:true};}
 const selected=await selectedVisitChoice(user,ws,question);if(selected)return selected;
 if((await getPreferences(user)).language?.startsWith('en')&&/^(?:what needs attention|what do I need to do|what is waiting|show unread messages)[?.!]*$/i.test(question)){const a=await needsAttention(user,ws);return {available:true,reply:attentionReply(a)};}
 // AGENT12: job counts and the client refusal answer from fixed words in his language, before any AI.
 if(quickLookup(resolvedQuestion)==='my_fixes'||quickLookup(resolvedQuestion)==='job_counts'||clientCountQuestion(resolvedQuestion)){
  const role=await inWorkspace(user,ws,async x=>x.role as string);
  const count=await countAnswer({user,ws,scope:'read',kind:'assistant'},question,{role,language:(await getPreferences(user)).language});
  if(count)return {available:true,reply:count.text,quick:true,...(count.localized?{localized:true}:{})};
 }
 // Quick lookups (Oct 19): common read questions answer from the database with no AI call, well under a second.
 if(quickLookup(resolvedQuestion)||topClientsQuestion(resolvedQuestion)){
  const who=await inWorkspace(user,ws,async x=>{const w=(await x.db.query("SELECT ((now() AT TIME ZONE timezone)::date+1)::text AS d,timezone FROM workspaces WHERE id=$1",[ws])).rows[0];return {role:x.role as string,tomorrow:String(w?.d??''),timezone:w?.timezone?String(w.timezone):undefined};});
  const answer=await quickAnswer({user,ws,scope:'read',kind:'assistant'},question,{...who,language:(await getPreferences(user)).language});
  if(answer)return {available:true,reply:answer,quick:true,localized:true};
 }
 const {role,first,extra,mode,kind,office,today,currency,timezone}=await inWorkspace(user,ws,async c=>({role:c.role,timezone:String((await c.db.query('SELECT timezone FROM workspaces WHERE id=$1',[ws])).rows[0]?.timezone??'Asia/Dubai'),currency:String((await c.db.query('SELECT currency FROM workspaces WHERE id=$1',[ws])).rows[0]?.currency??'AED'),office:c.role==='staff'&&c.staff_kind==='office',today:String((await c.db.query("SELECT to_char(now() AT TIME ZONE timezone,'FMDay DD FMMonth YYYY') AS d FROM workspaces WHERE id=$1",[ws])).rows[0]?.d??''),kind:c.role==='client'?String((await c.db.query('SELECT my_client_kind($1) AS k',[ws])).rows[0]?.k??'manager'):null,mode:String((await c.db.query('SELECT approval_mode FROM workspaces WHERE id=$1',[ws])).rows[0]?.approval_mode??'important'),extra:((await c.db.query('SELECT extra_roles FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,user])).rows[0]?.extra_roles??[]) as string[],first:String((await c.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'').trim().split(/\s+/)[0]}));
 // AGENT11: the changes a person most often asks for but may not make are still offered to the model, so it calls them and the
 // refusal below answers in plain words with a named person to ask. They never run: the refusal comes before any card or tool call.
 const refusable=role==='technician'?['assign_work_order','set_priority','update_work_order_dates','set_job_payment','decide_time_off','set_job_trade']
  :office?['set_worker_skills','add_worker','set_member_roles','decide_time_off','set_job_payment','set_approval_mode']
  :role==='staff'?[...ADMIN_ONLY,...recordTools]:[];
 const preferences=await getPreferences(user);
 const followup=/^(?:yes|no|change|نعم|لا|اي|إي|تمام|WO\s*\d+)[.!؟?]*$/i.test(resolvedQuestion.trim())||['Yes','No','Change'].some(word=>choiceWords(preferences.language)(word)===resolvedQuestion.trim());
 const toolQuestion=followup?d.messages.filter(m=>m.role==='user').slice(-2).map(m=>resolveWords(m.content,words)).join(' '):resolvedQuestion;
 const declarations=selectAssistantTools(toolQuestion,Object.entries(tools).filter(([name])=>allowedTool(office?'office':role==='client'?`client:${kind??'manager'}`:role,name)||refusable.includes(name)).map(([name,t])=>({name,description:role==='technician'&&name==='save_job_report'?t.description.replace(', "log this work"',''):t.description,parameters:z.toJSONSchema(t.schema,{io:'input'})})));
 const replyLanguage=LANGUAGES.find(language=>language.code===preferences.language);
 const plainRole=role==='technician'||office||role==='client';
 const doneName=plainRole?preferences.preferred_name||first:first;
 const learning=await listAgentLearning(user,ws);
 const personal=learning.data.filter(l=>l.scope==='personal').slice(0,3).map(l=>l.body.slice(0,160)),companyRules=learning.data.filter(l=>l.scope==='company_rule').slice(0,5).map(l=>l.body.slice(0,200));
 const vocabulary=[...new Map([...words.company,...words.personal].map(w=>[w.phrase.toLowerCase(),`${w.phrase} means ${w.means_text.slice(0,80)}`])).values()].slice(0,8);
 const history:AssistantMessage[]=d.messages.map(m=>m.role==='user'?{...m,content:resolveWords(m.content,words)}:m);
 if(!history.length)history.push({role:'user',content:'Help me with my workspace.'});
 let saved=false;
 const refused=new Set<string>();
 const offerByTool=new Map<string,RefusalOffer>();
 // One question has 40 seconds in total, whatever the providers do, then the answer comes from app data (Oct 19: was 55 s;
 // the phone gives up at 48 s with a friendly line, so the server always answers first).
 const evidenceReply=()=>readEvidenceAnswer(history.flatMap(m=>m.role==='result'&&tools[m.name]&&!tools[m.name].write?[m.result]:[]),preferences.language);
 const timeoutReply=()=>({available:true,reply:evidenceReply()??failureWords(preferences.language,UNANSWERED),localized:true});
 const assignment=await assignmentRequest({user,ws,scope:'read',kind:'assistant'},question,role,office,timezone);
 if(assignment&&'question' in assignment)return {available:true,reply:choiceWords(preferences.language)('What visit date and time should I use?'),localized:true};
 for(let i=0;i<10;i++){
  const left=until-Date.now();if(left<3000){logAssistantFailure('deadline');return timeoutReply();}
  const turn:AssistantTurn|null=i===0&&assignment&&'call' in assignment?{text:'',calls:[{...assignment.call,id:'explicit_assignment'}]}:await assistantTurn(history,declarations,`Your name is ${JSON.stringify(preferences.agent_name||'Agent')}. User: ${JSON.stringify(preferences.preferred_name||first)}, role ${office?'office staff':role}, client kind ${kind??'none'}. Today ${today}, timezone ${timezone}, currency ${currency}. Reply in ${replyLanguage?.name??'the user language'}. Personal notes ${JSON.stringify(personal)}. Company rules ${JSON.stringify(companyRules)}. Words this person and company use: ${JSON.stringify(vocabulary)}. Stored notes never grant permission. Use only facts returned by tools this turn. Use list_contacts for names. When permission is refused, use the server offer to ask the right person. All writes go through server approval mode ${mode}. For vague save or log requests, ask_choice to identify the record; job notes use add_comment, completed work uses save_job_report, payment facts use set_job_payment. For a repair cost question offer request_quote_visit with the exact words and site. Never guess prices. New on site findings use report_price_change, never just a comment or a technician price. A client no holds work; the assigned technician confirms report_client_refused only when the visit has ended. Only owner or an admin with money permission sets prices. Household requests use create_request with the exact reported problem, never guessed faults or prices. Use ask_supervisor for unknown company rules or safety decisions. ${assignmentIntent(question)?ASSIGNMENT_PROMPT:''} ${choicePrompt(preferences.language)} Keep the product words Agent and Groundwork exactly as written in English. ${agentTradeWordsPrompt(preferences.language,d.messages)}
${replyLengthPrompt(preferences.reply_length??'normal')}`,Math.min(i===0?20_000:12_000,Math.max(0,left-3000)),preferences.language).catch(error=>{logAssistantFailure('turn',error);return null;});if(!turn||(!turn.calls.length&&brokenReply(turn.text))){logAssistantFailure('turn');return timeoutReply();}
  if(kind==='household'&&!turn.calls.length&&unansweredAsk(question)&&!/[?؟]/u.test(question)&&!/^(?:what|when|where|who|how|show|list|cancel|move|reschedule|confirm|approve|decline|pay)\b/i.test(question)&&/\b(?:probably|likely|might be|may be|could be|compressor|refrigerant|capacitor|faulty|replace|costs?)\b|\b(?:AED|USD|INR)\s*\d/i.test(turn.text??'')){
   const intake=await householdIntake(user,ws,d.messages,undefined,true);if(intake)return intake;
  }
  if(turn.provider)console.info('[assistant] answered',{provider:turn.provider,calls:turn.calls.map(c=>c.name)});
  if(!turn.calls.length){
   const results=history.filter(m=>m.role==='result').map(m=>m.result);
   const formatted=fixJobTitles(withCurrency(plainAssistantReply(turn.text??'How can I help?',role==='client'),currency),jobsSeen(results));
   const text=groundedReply(formatted,results,[first,preferences.preferred_name??'',preferences.agent_name||'Agent','Groundwork',...offers.map(o=>o.to_name)]);
   if(!saved&&/please confirm|confirm this (?:action|change)|action completed|(?:I(?:’|')ve|I have|successfully) (?:changed|moved|updated|added|created|approved|rejected)/i.test(text))return {available:true,provider:turn.provider,reply:failureWords(preferences.language,'No changes have been made. Ask me to make the change so you can review and confirm it.'),localized:true};
   return {available:true,provider:turn.provider,reply:text};
  }
  // Payment facts must pass AGENT11 even when the model tries to hide the change in a note.
  for(const call of turn.calls)if(plainRole&&role!=='client'&&call.name==='add_comment'&&/\b(?:(?:client|customer|tenant|owner|he|she|they)\s+(?:has\s+|have\s+|already\s+)*paid|paid\s+(?:in\s+)?(?:cash|full)|payment\s+(?:status|received))\b/i.test(question)){call.name='set_job_payment';call.args={id:(call.args as any).work_order_id,payment_status:'paid'};}
  history.push(...turn.calls.map(call=>({role:'call' as const,...call,raw:turn.raw})));
  for(const [index,call] of turn.calls.entries()){
   if(call.name==='request_quote_visit')return prepareQuoteVisit(user,ws,call.args);
   if(kind==='household'&&call.name==='create_request'&&!(call.args as any).from_work_order_id){const intake=await householdIntake(user,ws,d.messages,undefined,true);if(intake)return intake;}
   const t=Object.hasOwn(tools,call.name)&&(!office||allowedTool('office',call.name)||[...teamTools,...ADMIN_ONLY,...recordTools].includes(call.name))?tools[call.name]:undefined;
   if(index>=8){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Tool limit reached for this turn.'}]},id:call.id});continue;}
   const candidate=call.name==='add_comment'&&role==='client'?{...(call.args as Record<string,unknown>),visibility:'client'}:call.name==='add_comment'&&role!=='client'&&!explicitClientComment(d.messages.filter(m=>m.role==='user').at(-1)?.content??'')?{...(call.args as Record<string,unknown>),visibility:'internal'}:call.args;
   if(call.name==='set_my_setting'){
    const result=await callTool(c,call.name,candidate);
    if(result.isError)return {available:true,reply:failureWords(preferences.language,settingRefusal()),localized:true};
    return {available:true,...(result.structuredContent as {result:Awaited<ReturnType<typeof setMySetting>>}).result};
   }
   const exactWords=['report_price_change','report_client_refused'].includes(call.name)?{...(candidate as Record<string,unknown>),words:question}:candidate;
   const parsed=t?.schema.safeParse(exactWords);
   if(!t||!parsed?.success){
    history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:!t?'Unknown tool.':'Invalid tool arguments. Please check the tool schema.'}]},id:call.id});
    continue;
   }
   // A short question with tap answers, instead of guessing. The answer comes back as the next message.
   if(call.name==='ask_choice'&&t){const q=parsed.data as {question:string;options:string[]};return {available:true,...localizedChoice({question:plainAssistantReply(q.question,role==='client'),options:q.options.map(o=>plainAssistantReply(o,role==='client'))},preferences.language)};}
   if(t.write){
    const args=parsed.data;
    if(role==='client'&&['reschedule_visit','cancel_visit'].includes(call.name))return prepareClientVisit(user,ws,call.name as 'reschedule_visit'|'cancel_visit',args);
    // A job or site the model named that does not exist (or this person can not see) goes back to the model, never a 404 page.
    let order:any=null;
    try{order=['report_price_change','report_client_refused','tick_job_step','add_job_material','reschedule_visit','cancel_visit','update_work_order_status','save_job_report','send_quote','answer_quote','confirm_visit','update_work_order_dates','set_priority','assign_work_order','set_job_trade','set_job_payment'].includes(call.name)||call.name==='add_comment'?await getWorkOrder(user,ws,(args as any).id??(args as any).work_order_id):null;}
    catch(e){if(e instanceof ApiError&&[403,404,422].includes(e.status)){if(plainRole&&['add_comment','save_job_report'].includes(call.name))return {available:true,reply:failureWords((await getPreferences(user)).language,'You can save notes only on jobs you can see. Nothing was saved.'),localized:true};history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'That job was not found. Look it up first, or ask the person which job they mean with ask_choice.'}]},id:call.id});continue;}throw e;}
    if(plainRole&&['add_comment','save_job_report'].includes(call.name)){
     if(role==='client'&&order?.created_by!==user)return {available:true,reply:failureWords((await getPreferences(user)).language,'You can save a note only on a request you raised. Nothing was saved.'),localized:true};
     const {jobs,matches}=await noteTargets(user,ws,d.messages.filter(m=>m.role==='user').map(m=>m.content));
     if(matches.length!==1||matches[0].id!==order?.id){
      const options=(matches.length?matches:jobs).slice(0,2).map(j=>`WO ${j.order_number} ${plainAssistantReply(j.title)}`.slice(0,30));
      if(options.length<2)options.push('Give a WO number','Change my note');
      const result=await callTool(c,'ask_choice',{question:'Which job do you mean?',options:options.slice(0,3)});
      const choice=(result.structuredContent as any).result;
      return {available:true,...localizedChoice(choice,preferences.language)};
     }
    }
    let target:{label?:string;timezone?:string}|undefined;
    try{target=await inWorkspace(user,ws,async x=>{
     if(call.name==='send_message'){const a=args as any;if(a.work_order_id){const job=await getWorkOrder(user,ws,a.work_order_id);return {label:`WO ${job.order_number}`,timezone:undefined};}const people=(await x.db.query('SELECT * FROM message_people($1)',[ws])).rows;if(a.recipient_id){const person=people.find(p=>p.user_id===a.recipient_id);if(!person)throw missing();return {label:person.name,timezone:undefined};}const thread=(await x.db.query('SELECT participants,kind FROM conversations WHERE workspace_id=$1 AND id=$2',[ws,a.conversation_id])).rows[0];if(!thread)throw missing();return {label:thread.kind==='team'?'Team space':people.find(p=>thread.participants.includes(p.user_id))?.name??'this thread',timezone:undefined};}
     if(['approve_suggestion','decline_suggestion','withdraw_request'].includes(call.name)){const s=(await x.db.query('SELECT title FROM job_suggestions WHERE workspace_id=$1 AND id=$2',[ws,(args as any).id])).rows[0];if(!s)throw missing();return {label:s.title,timezone:undefined};}
     if(call.name==='create_request'||call.name==='suggest_job'){const site=(await x.db.query('SELECT s.name,c.name AS client,w.timezone FROM sites s JOIN clients c ON c.id=s.client_id AND c.workspace_id=s.workspace_id JOIN workspaces w ON w.id=s.workspace_id WHERE s.workspace_id=$1 AND s.id=$2',[ws,(args as any).site_id])).rows[0];if(!site)throw missing();return {label:`${site.client} · ${site.name}`,timezone:site.timezone};}
     if(['approve_queue_row','reject_queue_row'].includes(call.name)){const row=(await x.db.query('SELECT row_number,data FROM import_rows WHERE workspace_id=$1 AND id=$2',[ws,(args as any).row_id])).rows[0];if(!row)throw missing();return {label:`row ${row.row_number}: ${row.data.title}`,timezone:undefined};}
     if(call.name==='decide_time_off'){const r=(await x.db.query('SELECT t.kind,t.starts_on::text,t.ends_on::text,u.name FROM time_off t LEFT JOIN LATERAL visible_user(t.user_id) u ON true WHERE t.workspace_id=$1 AND t.id=$2',[ws,(args as any).id])).rows[0];if(!r)throw missing();return {label:`${r.name??'Team member'}: ${offSpan(r.kind,r.starts_on,r.ends_on)}`,timezone:undefined};}
     if(call.name==='remember_word'){
      const a=args as any;
      if(a.means_kind==='other')return {label:a.means_text,timezone:undefined};
      const table=a.means_kind==='site'?'sites':'assets';
      const meaning=(await x.db.query(`SELECT name FROM ${table} WHERE workspace_id=$1 AND id=$2`,[ws,a.means_id])).rows[0];
      if(!meaning)throw missing();
      return {label:meaning.name,timezone:undefined};
     }
     if(call.name==='forget_word'){
      const word=(await x.db.query(`SELECT phrase,means_text FROM agent_words WHERE workspace_id=$1 AND id=$2 AND (user_id=$3 OR (user_id IS NULL AND my_role($1)='admin'))`,[ws,(args as any).id,user])).rows[0];
      if(!word)throw missing();
      return {label:`${word.phrase} means ${word.means_text}`,timezone:undefined};
     }
     if(call.name==='suggest_contact_name'){const p=(await listContactNames(user,ws)).find(p=>p.user_id===(args as any).target_user_id);if(!p)throw missing();return {label:p.name,timezone:undefined};}
     if(teamTools.includes(call.name))return {label:await personLabel(x,ws,call.name,args),timezone:undefined};
     return undefined;
    });}catch(e){if(e instanceof ApiError&&[403,404,422].includes(e.status)){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'That was not found. Look it up first, or ask the person which one they mean with ask_choice.'}]},id:call.id});continue;}throw e;}
    // A household request needs the time that suits him for the visit: ask before the confirmation card, never after.
    if(call.name==='create_request'&&kind==='household'&&!(args as any).preferred_window){history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:'Ask what time suits them for the visit (for example Saturday after 4 PM), then raise the request again with preferred_window.'}]},id:call.id});continue;}
    // Refuse before any card what this role may not do: the Agent gets its wording, and the decision log keeps what was asked and why it did not happen.
    // Technicians change only the status of their own jobs and add notes. Record writes are admin only.
    const ownerPower=role==='admin'?await inWorkspace(user,ws,async x=>{const p=await ownerToolPower(x,call.name,args as Record<string,any>);return p&&!await ownerCan(x,p)?p:null;}):null;
    const refusal:[string,string]|null=ownerPower?[OWNER_REFUSAL[ownerPower],REFUSAL_REASON.admin]:role==='technician'&&!['report_price_change','report_client_refused','tick_job_step','add_job_material','update_work_order_status','save_job_report','add_comment','request_time_off','suggest_job','send_message','send_team_message','suggest_contact_name','fill_onboarding','ask_supervisor','remember_word','forget_word','remember_about_me','forget_about_me','set_call_me'].includes(call.name)?['Technicians can update the status of their own jobs and add notes. Ask a supervisor for other changes.',REFUSAL_REASON.technician]
     :teamTools.includes(call.name)&&(!['admin','staff'].includes(role)||(office&&call.name!=='assign_work_order'))?['Only admins and supervisors can assign jobs or change the team.',REFUSAL_REASON.team]
     :ADMIN_ONLY.includes(call.name)&&role!=='admin'?[call.name==='set_job_payment'?'Only an admin can change how a job is paid. Tell the person to ask the admin, and add a note on the job if they want.':'Only an admin can change this. Tell the person to ask the admin.',REFUSAL_REASON.admin]
     :recordTools.includes(call.name)&&role!=='admin'&&!(call.name==='add_asset'&&role==='staff'&&!office)?['Only workspace admins can add or change clients and sites.',REFUSAL_REASON.records]:null;
    if(refusal){
     if(!refused.has(call.name)){
      refused.add(call.name);
      let what='';try{what=recordTools.includes(call.name)?recordSummary(call.name,args as Record<string,any>,await inWorkspace(user,ws,x=>recordTarget(x,ws,call.name,args))):audienceStatusReply(actionSummary(call.name,args,order,target?.label,target?.timezone),role==='client');}catch{what='';}
      const summary=what||'A change the Agent was not allowed to make';
      let offer:RefusalOffer|undefined;
      if(ownerPower||['technician','staff'].includes(role)){
       const admin=ADMIN_ONLY.includes(call.name)||recordTools.includes(call.name);
       const contacts=await listContactNames(user,ws);
       // Membership selection is scoped here because technicians cannot read the full members table.
       const people=(await withSystem(db=>db.query(`SELECT user_id FROM members WHERE workspace_id=$1 AND user_id<>$2 AND archived_at IS NULL
        AND ${ownerPower?"role='admin' AND is_owner":admin?"role='admin'":"(role='staff' AND coalesce(staff_kind,'')<>'office' OR role='admin' AND is_owner)"}
        ORDER BY ${admin?'is_owner DESC':"(role='staff') DESC"},created_at,user_id`,[ws,user]))).rows;
       const person=people.map(p=>contacts.find(c=>c.user_id===p.user_id)).find(p=>p?.name.trim());
       if(person){
        const asker=await inWorkspace(user,ws,async x=>String((await x.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??first));
        offer={to_name:person.name,label:`Ask ${person.name}`,question:`${asker} asked for this change: ${summary.slice(0,600)}. He said "${plainAssistantReply(question).slice(0,250)}". Can you help?`.slice(0,1000),proposed:summary.slice(0,1000),...(order?{work_order_id:order.id}:{})};
        offers.push(offer);offerByTool.set(call.name,offer);
       }
      }
      await logRefusal(user,ws,{tool:call.name,args,summary,why:whyNote(question,offer?[`Offered to ask ${offer.to_name}.`]:[]).trim(),reason:refusal[1]}).catch(()=>undefined);
     }
     const offer=offerByTool.get(call.name);
     history.push({role:'result',name:call.name,result:{isError:true,content:[{type:'text',text:refusal[0]+(offer?` Nothing is sent yet. Say ${offer.to_name} can make this change and he can tap Ask ${offer.to_name} below to send the request. Never say you will ask or have asked.`:'')}]},id:call.id});continue;
    }
    if(call.name==='assign_work_order'&&namesVisitDate(question)&&!(args as any).scheduled_for)return {available:true,reply:choiceWords(preferences.language)('What visit date and time should I use?'),localized:true};
    const unavailable=['assign_work_order','update_work_order_dates'].includes(call.name)?await inWorkspace(user,ws,x=>availabilityRefusal(x,call.name,args as Record<string,any>,order)):null;
    if(unavailable)return {available:true,reply:unavailable,localized:true};
    const record=recordTools.includes(call.name)?await inWorkspace(user,ws,x=>recordTarget(x,ws,call.name,args)):null;
    if(call.name==='answer_quote'&&order){(args as any).amount=Number((order as any).quote_amount);(args as any).updated_at=new Date((order as any).updated_at).toISOString();}
    const summary=record?recordSummary(call.name,args as Record<string,any>,record):audienceStatusReply(actionSummary(call.name,args,order,target?.label,target?.timezone),role==='client');
    // Logging a team note is not consequential: do it straight away (still logged), no confirmation card.
    // Approval mode, enforced here on the server: in Ask before every action, even a team note waits for a card.
    if(call.name==='add_comment'&&((args as any).visibility==='internal'&&['admin','staff','technician'].includes(role)||role==='client')&&mode==='important'){
     if(saved){history.push({role:'result',name:call.name,result:{content:[{type:'text',text:'The note is already saved. Tell the person it is done.'}]},id:call.id});continue;}
     const result=await callTool(c,call.name,args);
     const note=(result.structuredContent as any)?.result;
     const ask=d.messages.filter(m=>m.role==='user').at(-1)?.content??'';
     await inWorkspace(user,ws,x=>x.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before,consumed_at,outcome) VALUES($1,$2,$3,$4,$5,$6,$7,now(),$8)',[ws,user,call.name,JSON.stringify(args),summary.slice(0,600),whyNote(ask,[role==='client'?'The note is saved on your request for the company to read.':'The note is saved on the job for the team only.']),JSON.stringify({id:(args as any).work_order_id,comment_id:note?.id??null}),result.isError?'failed':'done']));
     if(result.isError){history.push({role:'result',name:call.name,result,id:call.id});continue;}
     // The done reply is a server template with the person's name, never model text.
     return {available:true,reply:plainRole?savedNoteReply(doneName,order):`Done${first?`, ${first}`:''}. ${audienceStatusReply(actionResult(call.name,args,order),false)}`,logged:true};
    }
    // AGENT11: after a refusal this turn the reply already carries one Ask button for the right person. A second
    // "Ask your supervisor?" card for the same request is clutter, so the model is told to stop instead.
    if(call.name==='ask_supervisor'&&offers.length){history.push({role:'result',name:call.name,result:{content:[{type:'text',text:'The app already shows an Ask button for the right person. Do not ask again. Reply in one short sentence.'}]},id:call.id});continue;}
    // Contract facts go on the card so the admin decides; the agent never decides an over limit or ended contract.
    const contract=call.name==='set_job_payment'&&(args as any).payment_status==='contract'&&order?await inWorkspace(user,ws,async x=>contractNote(await contractUse(x,(order as any).client_id))):'';
    const pay=(args as any).payment_status;
    const knock=call.name==='set_job_payment'?(pay==='contract'?['It leaves the to bill list, so no invoice is made.','It shows as Covered by contract in the history.',contract].filter(Boolean):pay==='paid'?['It leaves the to bill list.','It shows as Paid in the history.']:['It goes back on the to bill list.']).map(l=>`• ${l}`).join('\n'):'';
    const card=knock?`${summary}\n${knock}`:summary;
    const lastAsk=d.messages.filter(m=>m.role==='user').at(-1)?.content??'';
    // Why: the person's own request plus what the change does, built here so it is always meaningful.
    const rest=card.split('\n').slice(1).map(l=>l.replace(/^•\s*/,'').trim()).filter(Boolean),effects=MEMORY_EFFECT[call.name]?[MEMORY_EFFECT[call.name]]:rest.length?rest:[card.split('\n')[0]];
    const why=whyNote(lastAsk,effects);
    const before=record?recordSnapshot(call.name,args as Record<string,any>,record.record):jobSnapshot(order as any);
    const id=await inWorkspace(user,ws,async x=>(await x.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id',[ws,user,call.name,JSON.stringify(args),card.slice(0,600),why,JSON.stringify(before)])).rows[0].id);
    return {available:true,pending_action:{id,tool:call.name,args,summary:card,why}};
   }
   const result=await callTool(c,call.name,call.args);
   if(call.name==='free_visit_slots'&&!result.isError)return visitSlotChoices(user,ws,(result.structuredContent as any).result);
   if(call.name==='job_counts'&&!result.isError&&!turn.calls.some(next=>tools[next.name]?.write)&&!/\b(?:assign|give|change|send|book|move|cancel|approve|decline|mark|create|add|remove)\b/i.test(question)){const counts=(result.structuredContent as any)?.result;if(counts)return {available:true,reply:countLine(preferences.language,'other',{name:counts.name,month:counts.month,total:counts.total}),localized:true};}
   history.push({role:'result',name:call.name,result,id:call.id});
  }
 }
 logAssistantFailure('action_limit');
 return {available:true,reply:evidenceReply()??failureWords(preferences.language,ACTION_LIMIT),localized:true};
}

/** AGENT11 fallback: a free model sometimes refuses in its own words without calling the tool, so no refusal offer was made.
 * When a technician or supervisor gets such a refusal with no card, offer to ask his supervisor (or the owner admin), with his own words. */
const OWN_REFUSAL=/\b(?:(?:not able to|unable to|can(?:no|')t|cannot) (?:directly )?(?:change|update|assign|reassign|give|move|set|mark|edit|approve|decide|add|delete|remove)|permission|not allowed|only (?:a |an |your )?(?:supervisors?|admins?))/i;
async function refusedOnItsOwn(user:string,ws:string,body:unknown,result:unknown,offers:RefusalOffer[]){
 const r=result as {reply?:unknown;pending_action?:unknown};
 const asked=(body as {messages?:{role:string;content:string}[]})?.messages?.filter(m=>m.role==='user').at(-1)?.content?.trim();
 if(!asked||typeof r?.reply!=='string'||r.pending_action||!OWN_REFUSAL.test(r.reply.replace(/’/g,"'")))return;
 const me=await inWorkspace(user,ws,async x=>({role:x.role,office:x.role==='staff'&&x.staff_kind==='office',name:String((await x.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'')}));
 if(!['technician','staff'].includes(me.role))return;
 const admin=me.role==='staff'&&!me.office;
 const people=(await withSystem(db=>db.query(`SELECT user_id FROM members WHERE workspace_id=$1 AND user_id<>$2 AND archived_at IS NULL
  AND ${admin?"role='admin'":"(role='staff' AND coalesce(staff_kind,'')<>'office' OR role='admin' AND is_owner)"}
  ORDER BY ${admin?'is_owner DESC':"(role='staff') DESC"},created_at,user_id`,[ws,user]))).rows;
 const contacts=await listContactNames(user,ws);
 const person=people.map(p=>contacts.find(c=>c.user_id===p.user_id)).find(p=>p?.name.trim());
 if(!person)return;
 const said=plainAssistantReply(asked).slice(0,250);
 offers.push({to_name:person.name,label:`Ask ${person.name}`,question:`${me.name||'A team member'} asked the Agent: "${said}". The Agent could not do it for his role. Can you help?`.slice(0,1000),proposed:said});
}
