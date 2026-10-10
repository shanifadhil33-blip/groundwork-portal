'use client';
import { useEffect, useRef, useState } from 'react';
import { post, RequestError } from '../../lib/ui/api';
import { BottomSheet, Button, Card, ErrorState } from '../ui';
type Message={role:'user'|'assistant';content:string};
type Pending={id:string;summary:string};
type Reply={available:boolean;reply?:string;pending_action?:Pending;result?:{isError?:boolean}};
export function Assistant({ws,open,onClose}:{ws:string;open:boolean;onClose:()=>void}){
 const [messages,setMessages]=useState<Message[]>([]),[input,setInput]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<Pending|null>(null),[resting,setResting]=useState(false),[error,setError]=useState(''),[failed,setFailed]=useState<{messages:Message[];confirm_action_id?:string}|null>(null);
 // Keep chat across sheet closes and component remounts in this session.
 const [restored,setRestored]=useState(false);
 const newest=useRef<HTMLDivElement>(null),lock=useRef(false);
 useEffect(()=>{
  try{const saved=JSON.parse(sessionStorage.getItem(`groundwork-assistant:${ws}`)??'null');if(Array.isArray(saved)&&saved.every(m=>m&&(m.role==='user'||m.role==='assistant')&&typeof m.content==='string'))setMessages(saved);}catch{ /* Storage may be unavailable. */ }
  setRestored(true);
 },[ws]);
 useEffect(()=>{if(!restored)return;try{sessionStorage.setItem(`groundwork-assistant:${ws}`,JSON.stringify(messages));}catch{ /* Keep in-memory chat when storage is unavailable. */ }},[messages,ws,restored]);
 useEffect(()=>{if(open)newest.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[messages,pending,resting,busy,open]);
 async function send(payload:{messages:Message[];confirm_action_id?:string}){if(lock.current)return;lock.current=true;setBusy(true);setError('');setResting(false);setFailed(payload);try{const result=await post<Reply>(`/api/workspaces/${ws}/assistant`,payload);if(payload.confirm_action_id)setPending(null);if(!result.available){setResting(true);}else{setMessages(current=>[...current,{role:'assistant',content:result.reply??'Action completed.'}]);setPending(result.pending_action??null);}setFailed(null);}catch(e){setError(e instanceof RequestError?e.message:'We couldn’t reach the assistant. Please try again.');if(e instanceof RequestError&&[404,409].includes(e.status)){setPending(null);setFailed(null);}}finally{lock.current=false;setBusy(false);}}
 function submit(){const text=input.trim();if(!text||busy||pending)return;const next=[...messages,{role:'user' as const,content:text}];setMessages(next);setInput('');void send({messages:next.slice(-30)});}
 return <BottomSheet open={open} onClose={onClose} title="Groundwork assistant" presentation="drawer" busy={busy} footer={<form className="assistant-composer" onSubmit={e=>{e.preventDefault();submit();}}><label htmlFor="assistant-input" className="sr-only">Ask the assistant</label><textarea id="assistant-input" value={input} maxLength={20000} rows={3} placeholder="Ask about your work orders…" disabled={busy||!!pending} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();submit();}}}/><Button type="submit" busy={busy} disabled={!input.trim()||!!pending||!!failed}>Send</Button></form>}><div className="stack assistant-chat"><p className="small">Ask questions or propose changes. You confirm each change before it happens.</p>{messages.map((m,i)=><article className={`comment ${m.role==='user'?'internal-note':''}`} key={i}><strong>{m.role==='user'?'You':'Assistant'}</strong><p className="preserve">{m.content}</p></article>)}{pending&&<Card className="stack"><h3>Confirm this change</h3><p className="preserve">{pending.summary}</p><div className="row"><Button busy={busy} onClick={()=>void send({messages:[],confirm_action_id:pending.id})}>Confirm</Button><Button variant="secondary" disabled={busy} onClick={()=>{setPending(null);setFailed(null);setError('');setMessages(m=>[...m,{role:'assistant',content:'Cancelled. No change was made.'}]);}}>Cancel</Button></div></Card>}{resting&&<p role="status">The assistant is unavailable right now. Everything else works as normal.</p>}{error&&<ErrorState message={error} retry={()=>{if(failed)void send(failed);else setError('');}}/ >}{busy&&<p role="status">{pending?'Applying your confirmed change…':'Thinking…'}</p>}<div ref={newest}/></div></BottomSheet>;
}
