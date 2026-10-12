'use client';
import { plainAssistantReply } from '../../lib/ui/assistant-replies';
import { useApp } from './context';
import { ArrowUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AssistantMarkdown } from '../ui/assistant-markdown';
import { post, RequestError } from '../../lib/ui/api';
import { BottomSheet, Button, Card, ErrorState } from '../ui';
type Message={role:'user'|'assistant';content:string};
type Pending={id:string;summary:string};
type Reply={available:boolean;reply?:string;message?:string;pending_action?:Pending;result?:{isError?:boolean}};
export function Assistant({ws,open,onClose}:{ws:string;open:boolean;onClose:()=>void}){
 const {member}=useApp();
 const [messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[resting,setResting]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState<{messages:Message[];confirm_action_id?:string}|null>(null);
 const inputRef=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{const field=inputRef.current;if(!field)return;field.style.height='auto';field.style.height=`${Math.min(field.scrollHeight,156)}px`;field.style.overflowY=field.scrollHeight>156?'auto':'hidden';},[input,open]);
 // Keep chat across sheet closes and component remounts in this session.
 const [restored,setRestored]=useState(false);
 const newest=useRef<HTMLDivElement>(null),lock=useRef(false);
 useEffect(()=>{
  try{const saved=JSON.parse(sessionStorage.getItem(`groundwork-assistant:${ws}`)??'null');if(Array.isArray(saved)&&saved.every(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'))setMessages(saved);}catch{ /* Storage may be unavailable. */ }
  setRestored(true);
 },[ws]);
 useEffect(()=>{if(!restored)return;try{sessionStorage.setItem(`groundwork-assistant:${ws}`,JSON.stringify(messages));}catch{ /* Keep in-memory chat when storage is unavailable. */ }},[messages,ws,restored]);
 useEffect(()=>{if(open)newest.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[messages,pending,resting,busy,open]);
 async function send(payload:{messages:Message[];confirm_action_id?:string}){if(lock.current)return;lock.current=true;setBusy(true);setError('');setResting(false);setFailed(payload);try{const result=await post<Reply>(`/api/workspaces/${ws}/assistant`,payload);if(payload.confirm_action_id)setPending(null);if(!result.available){setMessages(current=>[...current,{role:'assistant',content:result.message??'I can’t answer that right now. Please try again in a minute. Everything else in Groundwork works as normal.'}]);setFailed(null);}else{setMessages(current=>[...current,{role:'assistant',content:result.reply??(result.pending_action?'Review the change below.':'No changes were made.')}]);setPending(result.pending_action??null);}if(result.available)setFailed(null);}catch(e){setError(e instanceof RequestError?e.message:'We couldn’t reach the assistant. Please try again.');if(e instanceof RequestError&&[404,409].includes(e.status)){setPending(null);setFailed(null);}}finally{lock.current=false;setBusy(false);}}
 function submit(value=input){const text=value.trim();if(!text||busy||pending)return;const next=[...messages,{role:'user' as const,content:text}];setMessages(next);setInput('');void send({messages:next.slice(-30)});}
 return <BottomSheet open={open} onClose={onClose} title="Assistant" presentation="drawer" busy={busy} footer={<form className="assistant-composer" onSubmit={e=>{e.preventDefault();submit();}}><label htmlFor="assistant-input" className="sr-only">Ask the assistant</label><textarea ref={inputRef} id="assistant-input" value={input} maxLength={20000} rows={1} placeholder="Ask about your jobs…" disabled={busy||!!pending} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><Button type="submit" className="assistant-send" aria-label="Send" busy={busy} disabled={!input.trim()||!!pending||!!failed}><ArrowUp size={18}/></Button><span className="composer-hint">Enter to send · Shift+Enter for new line</span></form>}><div className="stack assistant-chat">{!messages.length&&<div className="assistant-suggestions"><p>Ask about your workspace. You confirm changes before they happen.</p>{["How many jobs are overdue?","Show jobs waiting on parts",member?.role==='client'?"Summarize my requests":"Sum up new requests"].map(prompt=><Button variant="secondary" key={prompt} disabled={busy||!!pending||!!failed} onClick={()=>submit(prompt)}>{prompt}</Button>)}</div>}{messages.map((m,i)=><article className={`assistant-message ${m.role}`} key={i}>{m.role==='assistant'?<AssistantMarkdown text={plainAssistantReply(m.content,member?.role==='client')}/>:<p className="preserve">{m.content}</p>}</article>)}{pending&&<Card className="stack"><h3>Confirm this change</h3><p className="preserve">{plainAssistantReply(pending.summary,member?.role==='client')}</p><div className="row"><Button busy={busy} onClick={()=>void send({messages:[],confirm_action_id:pending.id})}>Confirm</Button><Button variant="secondary" disabled={busy} onClick={()=>{setPending(null);setFailed(null);setError('');setMessages(m=>[...m,{role:'assistant',content:'Cancelled. No change was made.'}]);}}>Cancel</Button></div></Card>}{resting&&<ErrorState message="The assistant is unavailable right now. Everything else works as normal." retry={()=>{if(failed)void send(failed);}}/>}{error&&<ErrorState message={error} retry={()=>{if(failed)void send(failed);else setError('');}}/ >}{busy&&<p className="small" role="status">{pending?'Applying your confirmed change…':'Thinking…'}</p>}<div ref={newest}/></div></BottomSheet>;
}
