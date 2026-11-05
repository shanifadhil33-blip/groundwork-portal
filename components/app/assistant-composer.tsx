'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Square, LoaderCircle } from 'lucide-react';
import { ListeningBar } from './assistant-language';
import { IconButton } from '../ui/button';
import { speechLanguage, rememberedInputMode, rememberInputMode, MICROPHONE_BLOCKED, VOICE_UNSUPPORTED } from '../../lib/ui/voice';

type Recognition={lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{resultIndex?:number;results:ArrayLike<ArrayLike<{transcript:string}>&{isFinal?:boolean}>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
type SpeechWindow=Window & {SpeechRecognition?:new()=>Recognition;webkitSpeechRecognition?:new()=>Recognition};
/** Voice fills a draft. Only a deliberate Send submits it. */
export function AssistantComposer({input,setInput,inputRef,busy,blocked,active,submit,ws,language,voiceEnabled=true,inputLabel='Ask Agent',placeholder='Ask Agent or speak',onDictation,onTextChange,onMicrophone,reading=false,stopReading,rememberMode=false,onStop}:{onStop?:()=>void;input:string;setInput:React.Dispatch<React.SetStateAction<string>>;inputRef:React.RefObject<HTMLTextAreaElement|null>;busy:boolean;blocked:boolean;active:boolean;submit:()=>void;ws:string;language:string;voiceEnabled?:boolean;inputLabel?:string;placeholder?:string;onDictation?:(words:string,start:number)=>void;onTextChange?:(value:string)=>void;onMicrophone?:()=>void;reading?:boolean;stopReading?:()=>void;rememberMode?:boolean}){
 const [inputMode,setInputMode]=useState<'voice'|'text'>('text');
 useEffect(()=>{if(active&&rememberMode)setInputMode(rememberedInputMode());},[active,rememberMode]);
 const currentDraft=useRef(input),dictationCallback=useRef(onDictation);currentDraft.current=input;dictationCallback.current=onDictation;
 const recognition=useRef<Recognition|null>(null),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),upload=useRef<AbortController|null>(null);
 const [listening,setListening]=useState(false),[converting,setConverting]=useState(false),[elapsed,setElapsed]=useState(0),[voiceError,setVoiceError]=useState('');
 const pressedAt=useRef(0),live=useRef(false),generation=useRef(0),started=useRef(0),stopTimer=useRef<ReturnType<typeof setTimeout>|null>(null),interval=useRef<ReturnType<typeof setInterval>|null>(null),released=useRef(false);
 function clearClock(){if(stopTimer.current)clearTimeout(stopTimer.current);if(interval.current)clearInterval(interval.current);stopTimer.current=null;interval.current=null;}
 function releaseStream(){stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;}
 function cancel(){generation.current++;live.current=false;clearClock();if(recognition.current){recognition.current.onresult=null;recognition.current.onend=null;recognition.current.onerror=null;recognition.current.abort();recognition.current=null;}if(recorder.current){recorder.current.onstop=null;recorder.current.ondataavailable=null;recorder.current.onerror=null;if(recorder.current.state!=='inactive')recorder.current.stop();recorder.current=null;}releaseStream();upload.current?.abort();upload.current=null;}
 // With onStop (the Agent) he keeps typing and dictating while it thinks; other composers pause while saving.
 const paused=busy&&!onStop;
 useEffect(()=>{if(!active||paused||blocked||!voiceEnabled){cancel();setListening(false);setConverting(false);}},[active,paused,blocked,voiceEnabled]);
 useEffect(()=>()=>cancel(),[]);
 function append(words:string){if(!words.trim())return;if(rememberMode){setInputMode('voice');rememberInputMode('voice');}const before=currentDraft.current.trimEnd(),start=before.length+(before?1:0);dictationCallback.current?.(words.trim(),start);const next=[before,words.trim()].filter(Boolean).join(' ').slice(0,20000);currentDraft.current=next;setInput(next);inputRef.current?.focus();}
 function stop(){released.current=true;if(!live.current)return;live.current=false;clearClock();recognition.current?.stop();if(recorder.current?.state==='recording')recorder.current.stop();releaseStream();setListening(false);}
 function clock(){started.current=Date.now();setElapsed(0);setListening(true);interval.current=setInterval(()=>setElapsed(Math.floor((Date.now()-started.current)/1000)),250);stopTimer.current=setTimeout(stop,119_000);}
 async function dictate(){
  if(live.current){stop();return;}if(converting||paused||blocked||!voiceEnabled)return;
  onMicrophone?.();released.current=false;live.current=true;const run=++generation.current;setVoiceError('');
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
 {listening&&<ListeningBar language={language} elapsed={elapsed} cancel={()=>{cancel();setListening(false);setConverting(false);inputRef.current?.focus();}} stop={stop}/>}
 <div className="assistant-input-row">{reading&&<IconButton variant="secondary" className="assistant-control" label="Stop reading" onClick={stopReading}><Square size={18}/></IconButton>}{voiceEnabled&&<IconButton variant="secondary" className="assistant-control" label={listening?'Stop recording':'Use microphone'} aria-pressed={listening} disabled={paused||blocked||converting} onPointerDown={e=>{if(e.button!==0)return;e.currentTarget.setPointerCapture(e.pointerId);pressedAt.current=live.current?0:Date.now();void dictate();}} onPointerUp={()=>{/* A tap keeps listening until Stop; holding it is push to talk and release stops. */if(pressedAt.current&&Date.now()-pressedAt.current>=450)stop();pressedAt.current=0;}} onPointerCancel={()=>{pressedAt.current=0;}} onClick={e=>{if(e.detail===0)void dictate();}}>{listening?<Square size={18}/>:<Mic size={18}/>}</IconButton>}
 <label htmlFor="assistant-input" className="sr-only">{inputLabel}</label><textarea ref={inputRef} id="assistant-input" value={input} maxLength={20000} rows={1} placeholder={voiceEnabled&&rememberMode&&inputMode==='voice'?'Tap the microphone and speak':placeholder} disabled={paused||blocked} onChange={e=>{if(rememberMode){setInputMode('text');rememberInputMode('text');}onTextChange?.(e.target.value);setInput(e.target.value);}} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();if(!listening&&!converting)submit();}}}/>{busy&&onStop?<IconButton variant="secondary" type="button" className="assistant-control assistant-send assistant-stop" label="Stop" onClick={onStop}><Square size={14} fill="currentColor" aria-hidden="true"/></IconButton>:<IconButton variant="secondary" type="submit" className="assistant-control assistant-send" label="Send" aria-busy={busy} disabled={busy||!input.trim()||blocked||listening||converting}>{busy?<LoaderCircle className="spinner" size={18}/>:<ArrowUp size={20} strokeWidth={2.25}/>}</IconButton>}</div>
 {converting&&<span className="composer-hint">Writing your words…</span>}{voiceError&&<p role="status">{voiceError}</p>}</form>;
}
