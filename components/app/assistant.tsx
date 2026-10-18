'use client';
import { AgentAvatar } from './agent-avatar';
import { useLocalDraft } from '../../lib/ui/drafts';
import { ContactText } from './contact-name';
import { plainAssistantReply } from '../../lib/ui/assistant-replies';
import { personalAgentChatKey } from '../../lib/ui/personal-agent';
import { useApp } from './context';
import Link from 'next/link';
import { useResource } from './resource';
import { speechLanguage, MICROPHONE_BLOCKED, VOICE_UNSUPPORTED } from '../../lib/ui/voice';
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
 const {member,me}=useApp();
 const preferences=useResource<{agent_avatar?:string|null;agent_name:string|null;voice_enabled:boolean;language:string|null}>('/api/me/preferences');
 const agentName=preferences.data?.agent_name||'Agent';
 const heading=<Link href="/settings/agent" className="agent-heading" onClick={onClose} data-no-translate={!!preferences.data?.agent_name}><AgentAvatar avatar={preferences.data?.agent_avatar}/>{agentName}</Link>;
 const [messages,setMessages]=useState<Message[]>([]),[inputDraft,setInputDraft]=useLocalDraft(`groundwork-agent-draft:${me.user.id}:${ws}`,{body:''}),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[resting,setResting]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState<{messages:Message[];confirm_action_id?:string}|null>(null);
 const input=inputDraft.body,setInput=(v:React.SetStateAction<string>)=>setInputDraft(d=>({body:typeof v==='function'?v(d.body):v}));
 const inputRef=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const field=inputRef.current;if(!field)return;field.style.height='auto';field.style.height=`${Math.min(field.scrollHeight,156)}px`;field.style.overflowY=field.scrollHeight>156?'auto':'hidden';},[input,open]);
 // Keep chat across sheet closes and component remounts in this session.
 const chatKey=personalAgentChatKey(me.user.id,ws);
 const [restoredFor,setRestoredFor]=useState('');
 const [restored,setRestored]=useState(false),[choices,setChoices]=useState<string[]>([]);
 const newest=useRef<HTMLDivElement>(null),lock=useRef(false);
 useEffect(()=>{
  try{sessionStorage.removeItem(`groundwork-assistant:${ws}`);const saved=JSON.parse(sessionStorage.getItem(personalAgentChatKey(me.user.id,ws))??'null');setMessages(Array.isArray(saved)&&saved.every(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string')?saved:[]);}catch{ /* Storage may be unavailable. */ }
  setRestoredFor(chatKey);setRestored(true);
 },[ws,me.user.id]);
 useEffect(()=>{if(!restored||restoredFor!==chatKey)return;try{sessionStorage.setItem(personalAgentChatKey(me.user.id,ws),JSON.stringify(messages));}catch{ /* Keep in-memory chat when storage is unavailable. */ }},[messages,ws,me.user.id,restored,restoredFor,chatKey]);
 useEffect(()=>{if(open||docked)newest.current?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});},[messages,pending,resting,busy,open,docked]);
 async function send(payload:{messages:Message[];confirm_action_id?:string}){if(lock.current)return;lock.current=true;setBusy(true);setError('');setResting(false);setFailed(payload);try{const result=await post<Reply>(`/api/workspaces/${ws}/assistant`,payload);if(payload.confirm_action_id){setPending(null);window.dispatchEvent(new Event('groundwork-contact-names'));window.dispatchEvent(new Event('groundwork-onboarding'));}if(!result.available){setMessages(current=>[...current,{role:'assistant',content:result.message??'I can’t answer that right now. Please try again in a minute. Everything else in Groundwork works as usual.'}]);setFailed(null);}else{if(!result.pending_action)setMessages(current=>[...current,{role:'assistant',content:result.reply??'No changes were made.'}]);setPending(result.pending_action??null);if(result.logged)window.dispatchEvent(new Event('groundworkAgentLog'));setChoices(result.choices??[]);}if(result.available)setFailed(null);}catch(e){setError(e instanceof RequestError?e.message:'We couldn’t reach the agent. Please try again.');if(e instanceof RequestError&&[404,409].includes(e.status)){setPending(null);setFailed(null);}}finally{lock.current=false;setBusy(false);}}
 const asked=useRef(0);
 useEffect(()=>{if(!restored||!ask||ask.n===asked.current)return;asked.current=ask.n;submit(ask.text);});
 function submit(value=input){const text=value.trim();if(!text||busy||pending||failed)return;setChoices([]);const next=[...messages,{role:'user' as const,content:text}];setMessages(next);setInput('');void send({messages:next.slice(-30)});}
 function change(){
  // The log keeps that he said no. Nothing changes either way, so a failed save never blocks him.
  if(pending)void post(`/api/workspaces/${ws}/assistant/log/${pending.id}/decline`,{}).then(()=>window.dispatchEvent(new Event('groundworkAgentLog'))).catch(()=>undefined);
  setPending(null);setFailed(null);setError('');setChoices([]);
  setInput([...messages].reverse().find(m=>m.role==='user')?.content??'');
  setMessages(m=>[...m,{role:'assistant',content:'No change was made. Tell me what to change.'}]);
  requestAnimationFrame(()=>inputRef.current?.focus());
 }
 const rolePrompts=member?.role==='client'?['How are my requests going?','Report a problem','When is the technician coming?']:member?.role==='technician'?['What is my next job?','Job done, fixed it','I need a part']:member?.staff_kind==='office'?['Which jobs are late?','Create a new job','Add a note to a job']:['Which jobs are late?','Who is free tomorrow?','Create a new job'];
 const composer=<AssistantComposer ws={ws} language={preferences.data?.language??DEFAULT_LANGUAGE} voiceEnabled={!!preferences.data&&preferences.data.voice_enabled!==false} input={input} setInput={setInput} inputRef={inputRef} busy={busy} blocked={!!pending||!!failed} active={open||docked} submit={submit}/>;
 const chat=<div className="stack assistant-chat" aria-live="polite" aria-busy={busy}>{!messages.length&&<div className="assistant-suggestions"><p>Ask about your workspace. You confirm changes before they happen.</p>{[...rolePrompts,"Show jobs waiting on parts"].map(prompt=><Button variant="secondary" key={prompt} disabled={busy||!!pending||!!failed} onClick={()=>submit(prompt)}>{prompt}</Button>)}</div>}{messages.map((m,i)=><article data-no-translate={m.role==='user'?true:undefined} className={`assistant-message ${m.role}`} key={i}>{m.role==='assistant'?<AssistantMarkdown renderText={text=><ContactText text={text}/>} text={plainAssistantReply(m.content,member?.role==='client')}/>:<p className="preserve">{m.content}</p>}{i===messages.length-1&&m.role==='assistant'&&choices.length>0&&!pending&&!busy&&<div className="agent-chips" role="group" aria-label="Quick answers">{choices.map(c=><Button key={c} variant="secondary" size="sm" disabled={!!failed} onClick={()=>submit(c)}>{c}</Button>)}</div>}</article>)}{pending&&<article className="assistant-message assistant pending-reply"><h3>Confirm this change</h3><p className="preserve">{plainAssistantReply(pending.summary,member?.role==='client')}</p>{pending.why&&<p className="small agent-why"><strong>Why: </strong>{plainAssistantReply(pending.why,member?.role==='client')}</p>}<div className="row"><Button variant="secondary" busy={busy} disabled={!!failed} onClick={()=>void send({messages:[],confirm_action_id:pending.id})}>Yes</Button><Button variant="secondary" disabled={busy} onClick={change}>Change</Button></div></article>}{resting&&<ErrorState message="The agent is unavailable right now. Everything else works as usual." retry={()=>{if(failed)void send(failed);}}/>}{error&&<ErrorState message={error} retry={()=>{if(failed)void send(failed);else setError('');}}/>}{busy&&<p className="small" role="status">{pending?'Applying your confirmed change…':'Thinking…'}</p>}<div ref={newest}/></div>;
 if(docked)return <aside className="dashboard-assistant" aria-label={agentName}><header className="assistant-panel-header"><h2>{heading}</h2></header><div className="assistant-panel-body">{chat}</div><div className="assistant-panel-footer">{composer}</div></aside>;
 return <BottomSheet open={open} onClose={onClose} title={heading} presentation="assistant" busy={busy} footer={composer}>{chat}</BottomSheet>;
}

type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{resultIndex?:number;results:ArrayLike<ArrayLike<{transcript:string}>&{isFinal?:boolean}>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
/** Voice fills a draft. Only a deliberate Send submits it. */
export function AssistantComposer({input,setInput,inputRef,busy,blocked,active,submit,ws,language,voiceEnabled=true,inputLabel='Ask Agent',placeholder='Ask Agent or speak',onDictation}:{input:string;setInput:React.Dispatch<React.SetStateAction<string>>;inputRef:React.RefObject<HTMLTextAreaElement|null>;busy:boolean;blocked:boolean;active:boolean;submit:()=>void;ws:string;language:string;voiceEnabled?:boolean;inputLabel?:string;placeholder?:string;onDictation?:(words:string)=>void}){
 const recognition=useRef<Recognition|null>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),upload=useRef<AbortController|null>(null);
 const [listening,setListening]=useState(false),[converting,setConverting]=useState(false),[elapsed,setElapsed]=useState(0),[voiceError,setVoiceError]=useState('');
 const live=useRef(false),generation=useRef(0),started=useRef(0),stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null),interval=useRef<ReturnType<typeof setInterval>|null>(null),released=useRef(false);
 function clearClock(){if(stopTimer.current)clearTimeout(stopTimer.current);if(interval.current)clearInterval(interval.current);stopTimer.current=null;interval.current=null;}
 function releaseStream(){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;}
 function cancel(){generation.current++;live.current=false;clearClock();if(recognition.current){recognition.current.onresult=null;recognition.current.onend=null;recognition.current.onerror=null;recognition.current.abort();recognition.current=null;}if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;recorder.current.onerror=null;if(recorder.current.state!=='inactive')recorder.current.stop();recorder.current=null;}releaseStream();upload.current?.abort();upload.current=null;}
 useEffect(()=>{if(!active||busy||blocked||!voiceEnabled){cancel();setListening(false);setConverting(false);}},[active,busy,blocked,voiceEnabled]);
 useEffect(()=>()=>cancel(),[]);
 function append(words:string){if(!words.trim())return;onDictation?.(words.trim());setInput(current=>[current.trimEnd(),words.trim()].filter(Boolean).join(' ').slice(0,20000));inputRef.current?.focus();}
 function stop(){released.current=true;if(!live.current)return;live.current=false;clearClock();recognition.current?.stop();if(recorder.current?.state==='recording')recorder.current.stop();releaseStream();setListening(false);}
 function clock(){started.current=Date.now();setElapsed(0);setListening(true);interval.current=setInterval(()=>setElapsed(Math.floor((Date.now()-started.current)/1000)),250);stopTimer.current=setTimeout(stop,119_000);}
 async function dictate(){
  if(live.current){stop();return;}if(converting||busy||blocked||!voiceEnabled)return;
  released.current=false;live.current=true;const run=++generation.current;setVoiceError('');
  const Speech=(window as SpeechWindow).SpeechRecognition??(window as SpeechWindow).webkitSpeechRecognition;
  if(Speech){
   const speech=new Speech();recognition.current=speech;speech.lang=speechLanguage(language);speech.interimResults=false;speech.continuous=true;
   speech.onresult=event=>{if(run!==generation.current)return;const words=Array.from(event.results).slice(event.resultIndex??0).filter(r=>r.isFinal!==false).map(r=>r[0].transcript).join(' ');append(words);};
   speech.onerror=event=>{if(run!==generation.current)return;live.current=false;clearClock();setListening(false);setVoiceError(['not-allowed','service-not-allowed'].includes(event.error)?MICROPHONE_BLOCKED:'We could not hear you. Please try again or type your message.');};
   speech.onend=()=>{if(run!==generation.current)return;live.current=false;clearClock();setListening(false);};
   try{speech.start();clock();}catch{live.current=false;setVoiceError('We could not start the microphone. Please try again.');}
   return;
  }
  if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){live.current=false;setVoiceError(VOICE_UNSUPPORTED);inputRef.current?.focus();return;}
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:true});
   if(run!==generation.current||released.current){media.getTracks().forEach(track=>track.stop());live.current=false;return;}
   stream.current=media;
   const mime=['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
   const recording=new MediaRecorder(media,mime?{mimeType:mime}:undefined);recorder.current=recording;
   const chunks:Blob[]=[];let size=0;
   recording.ondataavailable=event=>{if(run!==generation.current)return;size+=event.data.size;if(size>25*1024*1024){cancel();setListening(false);setVoiceError('This recording is too large. Please record a shorter message.');return;}if(event.data.size)chunks.push(event.data);};
   recording.onerror=()=>{cancel();setListening(false);setVoiceError('We could not record your message. Please try again.');};
   recording.onstop=async()=>{
    releaseStream();clearClock();live.current=false;setListening(false);if(run!==generation.current)return;
    const duration=Math.min(120,(Date.now()-started.current)/1000),audio=new Blob(chunks,{type:recording.mimeType||mime||'audio/webm'});recorder.current=null;
    if(!audio.size)return;
    setConverting(true);const controller=new AbortController();upload.current=controller;
    try{const form=new FormData();form.append('audio',audio,'recording');form.append('duration',String(duration));
     const r=await fetch(`/api/workspaces/${ws}/assistant/transcribe`,{method:'POST',body:form,signal:controller.signal});
     if(run!==generation.current)return;const result=await r.json();if(!r.ok)throw Error();if(typeof result.transcript==='string')append(result.transcript);else throw Error();
    }catch{if(run===generation.current)setVoiceError('We could not hear your message. Please try again or type it.');}finally{if(run===generation.current){upload.current=null;setConverting(false);}}
   };
   recording.start(1000);clock();
  }catch(e){releaseStream();live.current=false;if(run!==generation.current)return;setListening(false);setVoiceError((e as {name?:string}).name==='NotAllowedError'?MICROPHONE_BLOCKED:'We could not start the microphone. Please try again.');}
 }
 return <form className="assistant-composer" onSubmit={e=>{e.preventDefault();if(!listening&&!converting)submit();}}>
 {listening&&<div className="voice-recording" role="status"><span className="recording-dot" aria-hidden="true"/><span>Listening</span><span>{Math.floor(elapsed/60)}:{String(elapsed%60).padStart(2,'0')}</span><Button type="button" variant="secondary" onClick={stop}>Stop</Button></div>}
 <div className="assistant-input-row">{voiceEnabled&&<IconButton variant="secondary" className="assistant-control" label={listening?'Stop recording':'Use microphone'} aria-pressed={listening} disabled={busy||blocked||converting} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);void dictate();}} onPointerUp={stop} onPointerCancel={stop} onClick={e=>{if(e.detail===0)void dictate();}}>{listening?<Square size={18}/>:<Mic size={18}/>}</IconButton>}
 <label htmlFor="assistant-input" className="sr-only">{inputLabel}</label><textarea ref={inputRef} id="assistant-input" value={input} maxLength={20000} rows={1} placeholder={placeholder} disabled={busy||blocked} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!listening&&!converting)submit();}}}/><IconButton variant="secondary" type="submit" className="assistant-control assistant-send" label="Send" aria-busy={busy} disabled={busy||!input.trim()||blocked||listening||converting}>{busy?<LoaderCircle className="spinner" size={18}/>:<ArrowUp size={18}/>}</IconButton></div>
 {converting?<span className="composer-hint">Writing your words…</span>:<span className="composer-hint composer-keys-hint">Enter to send, Shift+Enter for a new line</span>}{voiceError&&<p role="status">{voiceError}</p>}</form>;
}
