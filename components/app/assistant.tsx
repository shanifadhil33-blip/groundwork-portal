'use client';
import { Translated } from './app-words';
import { AssistantComposer } from './assistant-composer';
export { AssistantComposer } from './assistant-composer';
import { AssistantSuggestions } from './assistant-language';
import { failureWords, INCOMPLETE } from '../../lib/agent/failure-words';
import { JobNextStep } from './job-next-step';
import { visitChargeText } from '../../lib/visit-charge';
import type { VisitCharge } from '../../lib/services/visit-charge';
import { SharedPhotoUpload } from './shared-photo-upload';
import type { SettingChange } from '../../lib/agent/personalsettings';
import { useTheme } from '../ui/theme';
import { changeAppLanguage } from './translator';
import type { RefusalOffer } from '../../lib/ui/agent-offers';
import { AgentAvatar } from './agent-avatar';
import { useLocalDraft } from '../../lib/ui/drafts';
import { ContactText } from './contact-name';
import { plainAssistantReply } from '../../lib/ui/assistant-replies';
import { isHouseholdChoice } from '../../lib/agent/household';
import { personalAgentChatKey } from '../../lib/ui/personal-agent';
import { useApp } from './context';
import Link from 'next/link';
import { useResource } from './resource';
import { speechLanguage, speechText, pickSpeechVoice, rememberInputMode, editDictatedRanges, type DictatedRange } from '../../lib/ui/voice';
import { EmergencySafety, emergencyPrefix } from './emergency-safety';
import { DEFAULT_LANGUAGE } from '../../lib/languages';
import { useEffect, useRef, useState } from 'react';
import { AssistantMarkdown } from '../ui/assistant-markdown';
import { post, RequestError } from '../../lib/ui/api';
import { BottomSheet, Button, IconButton, ErrorState } from '../ui';
type Message={role:'user'|'assistant';content:string;offers?:(RefusalOffer & {sent?:boolean})[];localized?:boolean};
type HouseholdFields={visit_charge?:VisitCharge;words:string;home:string|null;where:string|null;since:string|null;photos:number};
type Pending={quote_visit?:boolean;household?:boolean;words?:string;id:string;tool?:string;summary:string;why?:string;fields?:HouseholdFields};
/** A card that creates a request is not a change: say what it is. */
const NEW_REQUEST_TOOLS=new Set(['create_request','household_request','suggest_job','quote_visit']);
const pendingHeading=(p:Pending)=>p.household||NEW_REQUEST_TOOLS.has(p.tool??'')?'New request':'Confirm this change';
/** App labels follow his language; his own words, his home's name and anything he typed stay exactly as written. */
function HouseholdCard({f}:{f:HouseholdFields}){
 const value=(v:string|null)=>v==null?<dd>Not given</dd>:<dd data-no-translate={isHouseholdChoice(v)?undefined:true}>{v}</dd>;
 return <><p className="preserve" data-no-translate>{f.words}</p><dl className="household-card-fields"><dt>Your home</dt>{f.home==null?<dd>Not given</dd>:<dd data-no-translate>{f.home}</dd>}<dt>Where</dt>{value(f.where)}<dt>Since</dt>{value(f.since)}<dt>Photos</dt><dd>{f.photos}</dd><dt>Visit charge</dt>{f.visit_charge?.amount==null?<dd>{visitChargeText(f.visit_charge)}</dd>:<dd><span data-no-translate>{f.visit_charge.currency} {f.visit_charge.amount.toFixed(2)}</span>{f.visit_charge.sample&&<> <span>(Sample price)</span></>}</dd>}</dl></>;
}
function QuoteVisitCard({f}:{f:HouseholdFields}) {
 return <div className="stack compact"><p data-no-translate className="preserve">{f.words}</p><dl className="household-card-fields"><dt>Site</dt><dd data-no-translate>{f.home}</dd><dt>Visit charge</dt><dd>{f.visit_charge?.amount==null?'The office will confirm the price.':<><span data-no-translate>{f.visit_charge.currency} {f.visit_charge.amount.toFixed(2)}</span>{f.visit_charge.sample&&<> <span>(Sample price)</span></>}</>}</dd></dl><p>The full price depends on what the technician finds.</p></div>;
}
type Reply={job_step?:{id:string;mode:string};household_photo?:boolean;setting_change?:SettingChange;offers?:RefusalOffer[];available:boolean;logged?:boolean;reply?:string;choices?:string[];message?:string;pending_action?:Pending;result?:{isError?:boolean};localized?:boolean};
export function Assistant({ws,open,onClose,ask,docked=false,homeContent}:{ws:string;open:boolean;onClose:()=>void;ask?:{text:string;n:number}|null;docked?:boolean;homeContent?:React.ReactNode}){
 const {member,me}=useApp();
 const {setTheme}=useTheme();
 const preferences=useResource<{agent_avatar?:string|null;agent_name:string|null;voice_enabled:boolean;language:string|null}>('/api/me/preferences');
 const voiceEnabled=!!preferences.data&&preferences.data.voice_enabled!==false;
 const [jobStep,setJobStep]=useState<{id:string;mode:string}|null>(null);
 const [reading,setReading]=useState(false);
 const utterance=useRef<SpeechSynthesisUtterance|null>(null),speechRun=useRef(0),dictated=useRef<DictatedRange[]>([]);
 const speechSettings=useRef({enabled:voiceEnabled,active:open||docked,language:preferences.data?.language,client:member?.role==='client'});
 speechSettings.current={enabled:voiceEnabled,active:open||docked,language:preferences.data?.language,client:member?.role==='client'};
 function stopReading(){speechRun.current++;if(typeof window!=='undefined')window.speechSynthesis?.cancel();utterance.current=null;setReading(false);}
 // Close always works, even while the Agent is thinking (Adhil, Oct 19): a pending question is cancelled; a confirmed change is left to finish.
 function close(){stopReading();if(lock.current&&!confirming.current)stop(true);onClose();}
 useEffect(()=>{if(!voiceEnabled||!(open||docked))stopReading();},[voiceEnabled,open,docked]);
 useEffect(()=>()=>{speechRun.current++;window.speechSynthesis?.cancel();},[ws,me.user.id]);
 function readReply(text:string,run:number){
  const settings=speechSettings.current;
  if(run!==speechRun.current||!settings.enabled||!settings.active||!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined')return;
  const locale=speechLanguage(settings.language),voice=pickSpeechVoice(window.speechSynthesis.getVoices(),locale),plain=speechText(plainAssistantReply(text,settings.client));
  if(!voice||!plain)return;
  const speech=new SpeechSynthesisUtterance(plain);speech.lang=locale;speech.voice=voice;utterance.current=speech;
  const finish=()=>{if(utterance.current===speech){utterance.current=null;setReading(false);}};
  speech.onend=finish;speech.onerror=finish;
  try{setReading(true);window.speechSynthesis.speak(speech);}catch{finish();}
 }
 const agentName=preferences.data?.agent_name||'Agent';
 const wide=useWide();
 useKeyboardHeight(open&&!docked);
 const heading=<Translated><Link href="/settings/agent" className="agent-heading" onClick={close} data-no-translate={preferences.data?.agent_name ? true : undefined}><AgentAvatar avatar={preferences.data?.agent_avatar}/>{agentName}</Link></Translated>;
 const [messages,setMessages]=useState<Message[]>([]),[inputDraft,setInputDraft]=useLocalDraft(`groundwork-agent-draft:${me.user.id}:${ws}`,{body:''}),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[resting,setResting]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState<{messages:Message[];confirm_action_id?:string;readAloud?:boolean;household_photo_ids?:string[]}|null>(null);
 const input=inputDraft.body,setInput=(v:React.SetStateAction<string>)=>setInputDraft(d=>({body:typeof v==='function'?v(d.body):v}));
 const inputRef=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const field=inputRef.current;if(!field)return;field.style.height='auto';field.style.height=`${Math.min(field.scrollHeight,156)}px`;field.style.overflowY=field.scrollHeight>156?'auto':'hidden';},[input,open]);
 // Keep chat across sheet closes and component remounts in this session.
 const chatKey=personalAgentChatKey(me.user.id,ws);
 const [restoredFor,setRestoredFor]=useState('');
 const [householdPhoto,setHouseholdPhoto]=useState(false),[photoIds,setPhotoIds]=useState<string[]>([]);
 const [restored,setRestored]=useState(false),[choices,setChoices]=useState<string[]>([]);
 /** A quick answer he tapped is the app's word, so his bubble shows it in his language; anything he typed stays as written. */
 const [tapped,setTapped]=useState<Set<string>>(()=>new Set());
 const newest=useRef<HTMLDivElement>(null),lock=useRef(false);
 const controller=useRef<AbortController|null>(null),confirming=useRef(false),stopped=useRef<'user'|'timeout'|null>(null),[stoppedNote,setStoppedNote]=useState(''),[slow,setSlow]=useState(false);
 useEffect(()=>{if(!busy){setSlow(false);return;}const t=setTimeout(()=>setSlow(true),8000);return()=>clearTimeout(t);},[busy]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 /** Stop waiting for the answer. The request is cancelled; the typed draft stays. */
 function stop(quiet=false){if(!controller.current)return;stopped.current='user';controller.current.abort();if(!quiet)requestAnimationFrame(()=>inputRef.current?.focus());}
 useEffect(()=>{
  try{sessionStorage.removeItem(`groundwork-assistant:${ws}`);const saved=JSON.parse(sessionStorage.getItem(personalAgentChatKey(me.user.id,ws))??'null');setMessages(Array.isArray(saved)&&saved.every(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string')?saved:[]);}catch{ /* Storage may be unavailable. */ }
  setRestoredFor(chatKey);setRestored(true);
 },[ws,me.user.id]);
 useEffect(()=>{if(!restored||restoredFor!==chatKey)return;try{sessionStorage.setItem(personalAgentChatKey(me.user.id,ws),JSON.stringify(messages));}catch{ /* Keep in-memory chat when storage is unavailable. */ }},[messages,ws,me.user.id,restored,restoredFor,chatKey]);
 useEffect(()=>{if((open||docked)&&(!homeContent||messages.length>0||pending||busy))newest.current?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[messages,pending,resting,busy,open,docked]);
 async function send(payload:{messages:Message[];confirm_action_id?:string;readAloud?:boolean;household_photo_ids?:string[]}){
  if(lock.current)return;
  stopReading();const run=speechRun.current;lock.current=true;
  const abort=new AbortController();controller.current=abort;stopped.current=null;confirming.current=!!payload.confirm_action_id;
  // The server answers within 40 s (from app data if the AI is slow); the phone never waits longer than 48 s.
  const timer=setTimeout(()=>{stopped.current='timeout';abort.abort();},48_000);
  setBusy(true);setError('');setResting(false);setFailed(payload);setStoppedNote('');
  try{
   const result=await post<Reply>(`/api/workspaces/${ws}/assistant`,{confirm_action_id:payload.confirm_action_id,...(payload.household_photo_ids?{household_photo_ids:payload.household_photo_ids}:{}),messages:payload.messages.map(({role,content})=>({role,content}))},{signal:abort.signal});
   if(result.setting_change){
    const {setting,value}=result.setting_change;
    if(setting==='theme'&&(value==='light'||value==='dark'||value==='system'))await setTheme(value);
    if(setting==='language')changeAppLanguage(typeof value==='string'?value:DEFAULT_LANGUAGE);
    preferences.setData?.(current=>current?{...current,[setting]:value}:current);
    if(setting==='voice_enabled')speechSettings.current.enabled=value===true;
    if(setting==='language')speechSettings.current.language=typeof value==='string'?value:null;
    void preferences.reload?.();
   }
   if(payload.confirm_action_id){setPending(null);window.dispatchEvent(new Event('groundwork-contact-names'));window.dispatchEvent(new Event('groundwork-onboarding'));}
   const replyText:string[]=[];
   if(!result.available){
    const content=result.localized&&result.message?result.message:failureWords(preferences.data?.language,result.message);
    setMessages(current=>[...current,{role:'assistant',content,localized:true}]);replyText.push(content);
   }else{
    if(result.reply||!result.pending_action||result.offers?.length){
     const content=result.reply??failureWords(preferences.data?.language,'No changes saved yet.');
     setMessages(current=>[...current,{role:'assistant',content,offers:result.offers,...(result.localized||!result.reply?{localized:true}:{})}]);replyText.push(content);
    }
    if(result.pending_action){replyText.push(result.pending_action.summary);if(result.pending_action.why)replyText.push(result.pending_action.why);}
    setPending(result.pending_action??null);setJobStep(result.job_step??null);
    if(result.logged)window.dispatchEvent(new Event('groundworkAgentLog'));
    setChoices(result.choices??[]);
    setHouseholdPhoto(result.household_photo===true);if(!result.household_photo)setPhotoIds([]);
   }
   if(payload.readAloud)readReply(replyText.join('\n'),run);
   setFailed(null);
  }catch(e){
   if(e instanceof RequestError&&e.code==='aborted'){
    // Stopped by him or by the time limit: never an error page, the draft and the chat stay.
    if(stopped.current==='timeout')setError(failureWords(preferences.data?.language,INCOMPLETE));
    else{setFailed(null);setStoppedNote(failureWords(preferences.data?.language,payload.confirm_action_id?INCOMPLETE:'Stopped. Ask again when you are ready.'));}
    return;
   }
   setError(failureWords(preferences.data?.language,e instanceof RequestError?e.message:INCOMPLETE));
   if(e instanceof RequestError&&[404,409].includes(e.status)){setPending(null);setFailed(null);}
  }finally{clearTimeout(timer);if(controller.current===abort)controller.current=null;confirming.current=false;lock.current=false;setBusy(false);}
 }

 const asked=useRef(0);
 useEffect(()=>{if(!restored||!ask||ask.n===asked.current)return;asked.current=ask.n;submit(ask.text);});
 function submit(value?:string){const draft=value===undefined,text=(value??input).trim();if(!text||busy||lock.current)return;
  // A new message while a card waits means no to that card (logged, nothing changes); a failed question is replaced.
  if(pending){void post(`/api/workspaces/${ws}/assistant/log/${pending.id}/decline`,{}).then(()=>window.dispatchEvent(new Event('groundworkAgentLog'))).catch(()=>undefined);setPending(null);}
  setFailed(null);setError('');setResting(false);const readAloud=draft&&dictated.current.some(r=>input.slice(r.start,r.end).trim());rememberInputMode(readAloud?'voice':'text');dictated.current=[];setChoices([]);const next=[...messages,{role:'user' as const,content:text}];setMessages(next);setInput('');void send({messages:next.slice(-30),readAloud:!!readAloud});}
 function change(){
  // The log keeps that he said no. Nothing changes either way, so a failed save never blocks him.
  if(pending)void post(`/api/workspaces/${ws}/assistant/log/${pending.id}/decline`,{}).then(()=>window.dispatchEvent(new Event('groundworkAgentLog'))).catch(()=>undefined);
  setPending(null);setFailed(null);setError('');setChoices([]);
  setHouseholdPhoto(false);setPhotoIds([]);
  dictated.current=[];setInput(pending?.household?pending.words??'':[...messages].reverse().find(m=>m.role==='user')?.content??'');
  setMessages(m=>[...m,{role:'assistant',content:'No change was made. Tell me what to change.'}]);
  requestAnimationFrame(()=>inputRef.current?.focus());
 }
 const rolePrompts=member?.role==='client'?['How are my requests going?','Report a problem','When is the technician coming?']:member?.role==='technician'?['What is my next job?','Job done, fixed it','I need a part']:member?.staff_kind==='office'?['Which jobs are late?','Create a new job','Add a note to a job']:['Which jobs are late?','Who is free tomorrow?','Create a new job'];
 const composer=<AssistantComposer placeholder={docked?'Ask the agent':undefined} ws={ws} language={preferences.data?.language??DEFAULT_LANGUAGE} voiceEnabled={voiceEnabled} rememberMode reading={reading} stopReading={stopReading} onMicrophone={stopReading} onTextChange={value=>{dictated.current=editDictatedRanges(input,value,dictated.current);}} onDictation={(words,start)=>{dictated.current.push({start,end:Math.min(20000,start+words.length)});}} input={input} setInput={setInput} inputRef={inputRef} busy={busy} blocked={false} onStop={()=>stop()} active={open||docked} submit={submit}/>;
 const chat=<div className="stack assistant-chat" aria-live="polite" aria-busy={busy}>{!messages.length&&!(docked&&homeContent)&&<AssistantSuggestions prompts={[...rolePrompts,"Show jobs waiting on parts"]} language={preferences.data?preferences.data.language??DEFAULT_LANGUAGE:undefined} busy={busy} submit={submit}/>}{messages.map((m,i)=><article data-no-translate={m.role==='user'&&!tapped.has(m.content)||m.localized?true:undefined} className={`assistant-message ${m.role}`} key={i}>{m.role==='assistant'?<>{emergencyPrefix(m.content)&&<EmergencySafety line={emergencyPrefix(m.content)!} language={preferences.data?.language}/>}<AssistantMarkdown renderText={text=><ContactText text={text}/>} text={plainAssistantReply(emergencyPrefix(m.content)?m.content.slice(emergencyPrefix(m.content)!.length).trim():m.content,member?.role==='client')}/></>:<p className="preserve">{m.content}</p>}{m.role==='assistant'&&m.offers?.map((offer,j)=><RefusalOfferButton key={j} ws={ws} offer={offer} onSent={()=>setMessages(current=>current.map((msg,n)=>n===i?{...msg,offers:msg.offers?.map((o,k)=>k===j?{...o,sent:true}:o)}:msg))}/>)}{i===messages.length-1&&m.role==='assistant'&&choices.length>0&&!pending&&!busy&&<div className="agent-chips" role="group" aria-label="Quick answers">{choices.map(c=><Button key={c} variant="secondary" size="sm" disabled={!!failed} onClick={()=>{setTapped(t=>new Set(t).add(c));submit(c);}}>{c}</Button>)}</div>}</article>)}{jobStep&&!busy&&<JobNextStep key={jobStep.id+jobStep.mode} base={`/api/workspaces/${ws}`} id={jobStep.id} mode={jobStep.mode}/>}{householdPhoto&&!busy&&!pending&&<div><SharedPhotoUpload base={`/api/workspaces/${ws}`} ids={photoIds} onChange={setPhotoIds} label="Add a photo"/>{photoIds.length>0&&<Button variant="secondary" onClick={()=>void send({messages,household_photo_ids:photoIds})}>Continue with photo</Button>}</div>}{pending&&<article className="assistant-message assistant pending-reply"><h3>{pending.quote_visit?'Quote visit':pendingHeading(pending)}</h3>{pending.quote_visit&&pending.fields?<QuoteVisitCard f={pending.fields}/>:pending.household&&pending.fields?<HouseholdCard f={pending.fields}/>:<p className="preserve" data-no-translate={pending.household||undefined}>{pending.household?pending.summary:plainAssistantReply(pending.summary,member?.role==='client')}</p>}{pending.why&&<p className="small agent-why"><strong>Why: </strong>{plainAssistantReply(pending.why,member?.role==='client')}</p>}<div className="row"><Button variant="secondary" busy={busy} disabled={!!failed} onClick={()=>void send({messages:[],confirm_action_id:pending.id})}>Yes</Button><Button variant="secondary" disabled={busy} onClick={change}>Change</Button></div></article>}{resting&&<ErrorState messageLocalized message={failureWords(preferences.data?.language)} retry={()=>{if(failed)void send(failed);}}/>}{error&&<ErrorState messageLocalized message={error} retry={()=>{if(failed)void send(failed);else setError('');}}/>}{stoppedNote&&!busy&&<p className="small agent-stopped" role="status" data-no-translate>{stoppedNote}</p>}{busy&&<div className="agent-typing" role="status"><span className="agent-dots" aria-hidden="true"><i/><i/><i/></span><span>{pending?'Applying your confirmed change…':slow?'Still working on it…':'Thinking…'}</span></div>}<div ref={newest}/></div>;
 if(docked)return <aside className="dashboard-assistant" aria-label={agentName}>{(!homeContent||messages.length>0)&&<header className="assistant-panel-header"><h2>{heading}</h2></header>}<div className="assistant-panel-body">{homeContent}{chat}</div><div className="assistant-panel-footer">{composer}</div></aside>;
 return <BottomSheet open={open} onCloseStart={stopReading} onClose={close} title={heading} presentation="assistant" nonModal={wide} footer={composer}>{chat}</BottomSheet>;
}

/** Each offer has its own lock so repeated taps send only one question. */
function RefusalOfferButton({ws,offer,onSent}:{ws:string;offer:RefusalOffer & {sent?:boolean};onSent:()=>void}){
 const lock=useRef(false),[busy,setBusy]=useState(false),[error,setError]=useState(false);
 async function send(){
  if(lock.current||offer.sent)return;lock.current=true;setBusy(true);setError(false);
  try{await post(`/api/workspaces/${ws}/agent-questions`,{question:offer.question,proposed:offer.proposed,...(offer.work_order_id?{work_order_id:offer.work_order_id}:{})});onSent();}
  catch{lock.current=false;setError(true);}finally{setBusy(false);}
 }
 if(offer.sent)return <p role="status"><span>Sent to</span>{' '}<bdi data-no-translate>{offer.to_name}</bdi><span>. Nothing changes until he answers.</span></p>;
 return <div className="stack"><Button className="tap fill text-start" variant="secondary" busy={busy} onClick={()=>void send()}><span>Ask</span>{' '}<span data-no-translate><bdi>{offer.to_name}</bdi></span></Button>{error&&<p role="alert">Could not send. Tap Ask to try again.</p>}</div>;
}

/** Laptop width: the Agent sits beside the page and never covers it. */
function useWide(){
 const [wide,setWide]=useState(false);
 useEffect(()=>{if(typeof matchMedia!=='function')return;const m=matchMedia('(min-width: 1024px)');const on=()=>setWide(!!m.matches);on();m.addEventListener?.('change',on);return()=>m.removeEventListener?.('change',on);},[]);
 return wide;
}
/** The phone keyboard never hides the input: the full screen panel follows the visible height. */
function useKeyboardHeight(active:boolean){
 useEffect(()=>{
  const v=typeof window!=='undefined'?window.visualViewport:null;if(!active||!v)return;
  const root=document.documentElement;const set=()=>{root.style.setProperty('--agent-vh',`${Math.round(v.height)}px`);root.style.setProperty('--agent-top',`${Math.round(v.offsetTop)}px`);};
  set();v.addEventListener('resize',set);v.addEventListener('scroll',set);
  return()=>{v.removeEventListener('resize',set);v.removeEventListener('scroll',set);root.style.removeProperty('--agent-vh');root.style.removeProperty('--agent-top');};
 },[active]);
}
