'use client';
import { plainAssistantReply } from '../../lib/ui/assistant-replies';
import { useApp } from './context';
import { DEFAULT_LANGUAGE } from '../../lib/languages';
import { ArrowUp, Mic, Square, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AssistantMarkdown } from '../ui/assistant-markdown';
import { post, RequestError } from '../../lib/ui/api';
import { BottomSheet, Button, IconButton, ErrorState } from '../ui';
type Message={role:'user'|'assistant';content:string};
type Pending={id:string;summary:string;why?:string};
type Reply={available:boolean;logged?:boolean;reply?:string;choices?:string[];message?:string;pending_action?:Pending;result?:{isError?:boolean}};
export function Assistant({ws,open,onClose,ask,docked=false}:{ws:string;open:boolean;onClose:()=>void;ask?:{text:string;n:number}|null;docked?:boolean}){
 const {member}=useApp();
 const [messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[resting,setResting]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState<{messages:Message[];confirm_action_id?:string}|null>(null);
 const inputRef=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const field=inputRef.current;if(!field)return;field.style.height='auto';field.style.height=`${Math.min(field.scrollHeight,156)}px`;field.style.overflowY=field.scrollHeight>156?'auto':'hidden';},[input,open]);
 // Keep chat across sheet closes and component remounts in this session.
 const [restored,setRestored]=useState(false),[choices,setChoices]=useState<string[]>([]);
 const newest=useRef<HTMLDivElement>(null),lock=useRef(false);
 useEffect(()=>{
  try{const saved=JSON.parse(sessionStorage.getItem(`groundwork-assistant:${ws}`)??'null');if(Array.isArray(saved)&&saved.every(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'))setMessages(saved);}catch{ /* Storage may be unavailable. */ }
  setRestored(true);
 },[ws]);
 useEffect(()=>{if(!restored)return;try{sessionStorage.setItem(`groundwork-assistant:${ws}`,JSON.stringify(messages));}catch{ /* Keep in-memory chat when storage is unavailable. */ }},[messages,ws,restored]);
 useEffect(()=>{if(open||docked)newest.current?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[messages,pending,resting,busy,open,docked]);
 async function send(payload:{messages:Message[];confirm_action_id?:string}){if(lock.current)return;lock.current=true;setBusy(true);setError('');setResting(false);setFailed(payload);try{const result=await post<Reply>(`/api/workspaces/${ws}/assistant`,payload);if(payload.confirm_action_id)setPending(null);if(!result.available){setMessages(current=>[...current,{role:'assistant',content:result.message??'I can’t answer that right now. Please try again in a minute. Everything else in Groundwork works as usual.'}]);setFailed(null);}else{if(!result.pending_action)setMessages(current=>[...current,{role:'assistant',content:result.reply??'No changes were made.'}]);setPending(result.pending_action??null);if(result.logged)window.dispatchEvent(new Event('groundworkAgentLog'));setChoices(result.choices??[]);}if(result.available)setFailed(null);}catch(e){setError(e instanceof RequestError?e.message:'We couldn’t reach the assistant. Please try again.');if(e instanceof RequestError&&[404,409].includes(e.status)){setPending(null);setFailed(null);}}finally{lock.current=false;setBusy(false);}}
 const asked=useRef(0);
 useEffect(()=>{if(!restored||!ask||ask.n===asked.current)return;asked.current=ask.n;submit(ask.text);});
 function submit(value=input){const text=value.trim();if(!text||busy||pending||failed)return;setChoices([]);const next=[...messages,{role:'user' as const,content:text}];setMessages(next);setInput('');void send({messages:next.slice(-30)});}
 function change(){
  setPending(null);setFailed(null);setError('');setChoices([]);
  setInput([...messages].reverse().find(m=>m.role==='user')?.content??'');
  setMessages(m=>[...m,{role:'assistant',content:'No change was made. Tell me what to change.'}]);
  requestAnimationFrame(()=>inputRef.current?.focus());
 }
 const rolePrompts=member?.role==='client'?['How are my requests going?','Report a problem','When is the technician coming?']:member?.role==='technician'?['What is my next job?','Job done, fixed it','I need a part']:member?.staff_kind==='office'?['Which jobs are late?','Create a new job','Add a note to a job']:['Which jobs are late?','Who is free tomorrow?','Create a new job'];
 const composer=<AssistantComposer input={input} setInput={setInput} inputRef={inputRef} busy={busy} blocked={!!pending||!!failed} active={open||docked} submit={submit}/>;
 const chat=<div className="stack assistant-chat" aria-live="polite" aria-busy={busy}>{!messages.length&&<div className="assistant-suggestions"><p>Ask about your workspace. You confirm changes before they happen.</p>{[...rolePrompts,"Show jobs waiting on parts"].map(prompt=><Button variant="secondary" key={prompt} disabled={busy||!!pending||!!failed} onClick={()=>submit(prompt)}>{prompt}</Button>)}</div>}{messages.map((m,i)=><article data-no-translate={m.role==='user'?true:undefined} className={`assistant-message ${m.role}`} key={i}>{m.role==='assistant'?<AssistantMarkdown text={plainAssistantReply(m.content,member?.role==='client')}/>:<p className="preserve">{m.content}</p>}{i===messages.length-1&&m.role==='assistant'&&choices.length>0&&!pending&&!busy&&<div className="agent-chips" role="group" aria-label="Quick answers">{choices.map(c=><Button key={c} variant="secondary" size="sm" disabled={!!failed} onClick={()=>submit(c)}>{c}</Button>)}</div>}</article>)}{pending&&<article className="assistant-message assistant pending-reply"><h3>Confirm this change</h3><p className="preserve">{plainAssistantReply(pending.summary,member?.role==='client')}</p>{pending.why&&<p className="small agent-why"><strong>Why: </strong>{plainAssistantReply(pending.why,member?.role==='client')}</p>}<div className="row"><Button variant="secondary" busy={busy} disabled={!!failed} onClick={()=>void send({messages:[],confirm_action_id:pending.id})}>Yes</Button><Button variant="secondary" disabled={busy} onClick={change}>Change</Button></div></article>}{resting&&<ErrorState message="The assistant is unavailable right now. Everything else works as usual." retry={()=>{if(failed)void send(failed);}}/>}{error&&<ErrorState message={error} retry={()=>{if(failed)void send(failed);else setError('');}}/>}{busy&&<p className="small" role="status">{pending?'Applying your confirmed change…':'Thinking…'}</p>}<div ref={newest}/></div>;
 if(docked)return <aside className="dashboard-assistant" aria-label="Assistant"><header className="assistant-panel-header"><h2>Assistant</h2></header><div className="assistant-panel-body">{chat}</div><div className="assistant-panel-footer">{composer}</div></aside>;
 return <BottomSheet open={open} onClose={onClose} title="Assistant" presentation="assistant" busy={busy} footer={composer}>{chat}</BottomSheet>;
}

type Recognition={lang:string;interimResults:boolean;onresult:((event:{results:ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:(()=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
/** Voice only fills the draft. The same Send and confirmation flow handles it. */
function AssistantComposer({input,setInput,inputRef,busy,blocked,active,submit}:{input:string;setInput:(value:string)=>void;inputRef:React.RefObject<HTMLTextAreaElement|null>;busy:boolean;blocked:boolean;active:boolean;submit:()=>void}){
 const recognition=useRef<Recognition|null>(null),[listening,setListening]=useState(false),[voiceError,setVoiceError]=useState('');
 useEffect(()=>{if(!active||busy||blocked){recognition.current?.abort();setListening(false);}},[active,busy,blocked]);
 useEffect(()=>()=>{if(recognition.current){recognition.current.onresult=null;recognition.current.onerror=null;recognition.current.onend=null;recognition.current.abort();}},[]);
 function dictate(){
  if(listening){recognition.current?.stop();return;}
  setVoiceError('');const Speech=(window as SpeechWindow).SpeechRecognition??(window as SpeechWindow).webkitSpeechRecognition;
  if(!Speech){setVoiceError('Voice input is unavailable in this browser. You can type your message.');inputRef.current?.focus();return;}
  const speech=new Speech();recognition.current=speech;speech.lang=document.documentElement.lang||DEFAULT_LANGUAGE;speech.interimResults=false;
  speech.onresult=event=>{const words=Array.from(event.results).map(r=>r[0].transcript).join(' ');setInput([input.trim(),words].filter(Boolean).join(' ').slice(0,20000));inputRef.current?.focus();};
  speech.onerror=()=>{setListening(false);setVoiceError('We couldn’t hear you. Check microphone access and try again.');};
  speech.onend=()=>setListening(false);
  try{speech.start();setListening(true);}catch{setVoiceError('We couldn’t start the microphone. Please try again.');setListening(false);}
 }
 return <form className="assistant-composer" onSubmit={e=>{e.preventDefault();submit();}}><div className="assistant-input-row"><IconButton variant="secondary" className="assistant-control" label={listening?'Stop recording':'Use microphone'} aria-pressed={listening} disabled={busy||blocked} onClick={dictate}>{listening?<Square size={18}/>:<Mic size={18}/>}</IconButton><label htmlFor="assistant-input" className="sr-only">Ask the assistant</label><textarea ref={inputRef} id="assistant-input" value={input} maxLength={20000} rows={1} placeholder="Ask Assistant or speak…" disabled={busy||blocked} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!listening)submit();}}}/><IconButton variant="secondary" type="submit" className="assistant-control assistant-send" label="Send" aria-busy={busy} disabled={busy||!input.trim()||blocked||listening}>{busy?<LoaderCircle className="spinner" size={18}/>:<ArrowUp size={18}/>}</IconButton></div><span className="composer-hint">{listening?'Listening…':'Enter to send · Shift+Enter for new line'}</span>{voiceError&&<p className="small" role="status">{voiceError}</p>}</form>;
}
