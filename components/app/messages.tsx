'use client';
import { useVisiblePoll } from '../../lib/hooks/use-visible-poll';
import { useLocalDraft } from '../../lib/ui/drafts';
import { enqueue } from '../../lib/ui/outbox';
import { useSelection } from './selection';
import { useContactNames } from './contact-names-context';
import { ContactName } from './contact-name';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from './context';
import { useResource } from './resource';
import { AssistantComposer } from './assistant-composer';
import { SharedPhotoUpload } from './shared-photo-upload';
import { Button,Card,ConfirmDialog,EmptyState,ErrorState,RelativeTime,Skeleton,useToast, Dropdown } from '../ui';
import { PageHeader } from '../ui/layout';
import { request,post,RequestError } from '../../lib/ui/api';
import { DEFAULT_LANGUAGE } from '../../lib/languages';
export type Message={id:string;sender_id:string;sender_name:string;body:string;original_body:string;original_language:string;created_at:string;photo_ids:string[];translated:boolean;visibility?:string;removed?:boolean;pinned_at?:string|null};
type Thread={conversation_id?:string;work_order_id?:string;recipient_id?:string};
export function ThreadMessages({thread,onSent,canModerate=false}:{thread:Thread;onSent?:(id:string)=>void;canModerate?:boolean}){
 const {member,me}=useApp(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const query=new URLSearchParams();if(thread.conversation_id)query.set('conversation_id',thread.conversation_id);if(thread.work_order_id)query.set('work_order_id',thread.work_order_id);
 const messages=useResource<{data:Message[];language:string;last_message_at:string|null}>(base&&query.size?`${base}/messages?${query}`:null),prefs=useResource<{language:string;voice_enabled:boolean}>('/api/me/preferences');
 const draftKey=`groundwork-draft:${me.user.id}:${member?.workspace_id}:${JSON.stringify(thread)}`;
 const [draft,setDraft,clearDraft]=useLocalDraft(draftKey,{body:'',photos:[] as string[],voice:'',visibility:'client'});
 const {body,photos,voice,visibility}=draft;
 const setBody=(v:string|((s:string)=>string))=>setDraft(d=>({...d,body:typeof v==='function'?v(d.body):v})),setPhotos=(v:string[])=>setDraft(d=>({...d,photos:v})),setVoice=(v:string|((s:string)=>string))=>setDraft(d=>({...d,voice:typeof v==='function'?v(d.voice):v})),setVisibility=(v:string)=>setDraft(d=>({...d,visibility:v}));
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[originals,setOriginals]=useState<string[]>([]),ref=useRef<HTMLTextAreaElement>(null),submission=useRef({body:'',key:''});
 const threadKey=JSON.stringify(thread);
 const [sendingBody,setSendingBody]=useState<string|null>(null),[removing,setRemoving]=useState<string|null>(null);
 useEffect(()=>{setError('');setOriginals([]);},[threadKey]);
 useVisiblePoll(messages.reload,60000);
 useEffect(()=>{const last=messages.data?.data.at(-1);if(!base||!last||!messages.data?.last_message_at)return;void post(`${base}/messages/read`,{conversation_id:thread.conversation_id,work_order_id:thread.work_order_id,through:messages.data.last_message_at,through_id:last.id}).then(()=>window.dispatchEvent(new Event('groundwork-messages-changed'))).catch(()=>setError('Could not mark these messages as read. Try again.'));},[messages.data,base,threadKey]);
 async function send(){if(!base||busy||(!body.trim()&&!photos.length))return;setBusy(true);setError('');setSendingBody(body||'Photo');const payload=JSON.stringify({...thread,body,photo_ids:photos,voice_note_text:voice||undefined,visibility});if(submission.current.body!==payload)submission.current={body:payload,key:crypto.randomUUID()};try{if(navigator.onLine===false){enqueue(me.user.id,member!.workspace_id,{id:submission.current.key,url:`${base}/messages`,body:payload,label:'Message'});clearDraft();submission.current={body:'',key:''};return;}const made=await request<{conversation_id?:string}>(`${base}/messages`,{method:'POST',headers:{'Idempotency-Key':submission.current.key},body:payload});clearDraft();submission.current={body:'',key:''};if(made.conversation_id)onSent?.(made.conversation_id);await messages.reload();window.dispatchEvent(new Event('groundwork-messages-changed'));}catch(e){if(e instanceof Error&&'status' in e&&e.status===0){try{enqueue(me.user.id,member!.workspace_id,{id:submission.current.key,url:`${base}/messages`,body:payload,label:'Message'});clearDraft();submission.current={body:'',key:''};}catch{setError('Could not keep this message on your phone. Your draft is saved.');}}else setError(e instanceof Error?e.message:'Could not send. Try again.');}finally{setBusy(false);setSendingBody(null);}}
 async function moderate(id:string,action:string){if(!base)return;setBusy(true);setError('');try{await post(`${base}/team-space/${id}`,{action});await messages.reload();}catch(e){setError(e instanceof Error?e.message:'Could not save. Try again.');}finally{setBusy(false);}}
 return <section className="stack message-thread" aria-label="Messages"><ConfirmDialog open={!!removing} onClose={()=>setRemoving(null)} title="Remove this message?" confirmLabel="Remove" danger busy={busy} onConfirm={async()=>{if(removing)await moderate(removing,'remove');setRemoving(null);}}>This removes the message for everyone. This cannot be undone.</ConfirmDialog>{messages.error?<ErrorState error={messages.error} retry={messages.reload}/>:messages.loading&&query.size?<p>Loading messages</p>:<ul className="message-list">{[...(messages.data?.data??[])].sort((a,b)=>Number(!!b.pinned_at)-Number(!!a.pinned_at)).map(m=><li key={m.id} className="stack compact"><div className="row wrap"><strong>{m.sender_id===me.user.id?'You':<ContactName name={m.sender_name} userId={m.sender_id}/>}</strong><RelativeTime value={m.created_at}/>{m.visibility==='internal'&&<span>Team only</span>}{m.pinned_at&&<span>Pinned</span>}</div>{m.removed?<p>Message removed by an admin</p>:<><p className="preserve" data-no-translate>{originals.includes(m.id)?m.original_body:m.body}</p>{m.translated&&<Button variant="ghost" onClick={()=>setOriginals(ids=>ids.includes(m.id)?ids.filter(id=>id!==m.id):[...ids,m.id])}>{originals.includes(m.id)?'Show translation':'Show original'}</Button>}<div className="photo-row">{m.photo_ids.map(id=><a key={id} href={`${base}/photos/${id}`}><img src={`${base}/photos/${id}`} alt="Message photo" width={80} height={80}/></a>)}</div>{canModerate&&<div className="row"><Button variant="ghost" disabled={busy} onClick={()=>void moderate(m.id,m.pinned_at?'unpin':'pin')}>{m.pinned_at?'Unpin':'Pin'}</Button><Button variant="ghost" disabled={busy} onClick={()=>setRemoving(m.id)}>Remove</Button></div>}</>}</li>)}</ul>}{sendingBody&&<div role="status"><p data-no-translate>{sendingBody}</p><p>Sending</p></div>}{!messages.data?.data.length&&!messages.loading&&<p>No messages yet. Start with a few words.</p>}{thread.work_order_id&&member?.role!=='client'&&<label>Who can read this<Dropdown label="Who can read this" width={240} value={visibility} onChange={setVisibility} options={[{value:'client',label:'Client and team'},{value:'internal',label:'Team only'}]}/></label>}<AssistantComposer ws={member?.workspace_id??''} language={prefs.data?.language??DEFAULT_LANGUAGE} voiceEnabled={prefs.data?.voice_enabled!==false} input={body} setInput={setBody} inputRef={ref} busy={busy} blocked={!!messages.error&&!(messages.error instanceof RequestError&&messages.error.status===0)} active submit={()=>void send()} inputLabel="Message" placeholder="Write a message or speak" onDictation={words=>setVoice(v=>[v,words].filter(Boolean).join(' '))}/>{base&&<SharedPhotoUpload base={base} ids={photos} onChange={setPhotos}/>}{!!photos.length&&!body.trim()&&<Button busy={busy} onClick={()=>void send()}>Send photo</Button>}{error&&<p role="alert">{error}</p>}</section>;
}
export function MessagesPage(){
 const {member,me}=useApp(),params=useSearchParams(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const threads=useResource<{data:{id:string;title:string;kind:string;participants?:string[];unread_count:number}[]}>(base?`${base}/messages`:null),people=useResource<{user_id:string;name:string}[]>(base?`${base}/messages/people`:null);
 const toast=useToast();
 async function markThreads(ids:string[]){
  const snapshot=threads.data;const receipts:{id:string;undo:unknown}[]=[];
  threads.setData(old=>old?{...old,data:old.data.map(t=>ids.includes(t.id)?{...t,unread_count:0}:t)}:old);
  try{for(const id of ids){const result=await request<{data:Message[];last_message_at:string|null}>(`${base}/messages?conversation_id=${id}`);const last=result.data.at(-1);if(last&&result.last_message_at){const saved=await post<{undo:unknown}>(`${base}/messages/read`,{conversation_id:id,through:result.last_message_at,through_id:last.id});receipts.push({id,undo:saved.undo});}}
   window.dispatchEvent(new Event('groundwork-messages-changed'));toast('Messages marked as read.',{label:'Undo',onClick:async()=>{for(const receipt of receipts)await request(`${base}/messages/read`,{method:'PATCH',body:JSON.stringify(receipt.undo)});await threads.reload();window.dispatchEvent(new Event('groundwork-messages-changed'));}});
  }catch(e){threads.setData(snapshot);await threads.reload();throw new Error('Could not mark these messages as read. Refresh and try again.');}
 }
 const selection=useSelection(threads.data?.data.filter(t=>t.kind==='direct').map(t=>t.id)??[],[{label:'Mark read',run:markThreads}]);
 const names=useContactNames(),[nameSearch,setNameSearch]=useState('');
 const [thread,setThread]=useState<Thread|null>(params.get('thread')?{conversation_id:params.get('thread')!}:null);
 const direct=(threads.data?.data??[]).filter(t=>t.kind==='direct'||t.kind==='team');
 const start=()=>document.getElementById('new-message')?.click();
 return <div className="page messages-page">
  <PageHeader><div className="page-title"><h1>Messages</h1><p>Talk with your team and clients. Messages about one job are inside that job.</p></div>
   <div className="page-actions"><Dropdown id="new-message" label="New message" width={260} placeholder="New message" value={thread?.recipient_id??''} searchLabel="Search names" onChange={v=>{const existing=threads.data?.data.find(t=>t.kind==='direct'&&t.participants?.includes(v)&&t.participants?.includes(me.user.id));setThread(existing?{conversation_id:existing.id}:v?{recipient_id:v}:null);}} options={(people.data??[]).map(p=>({value:p.user_id,label:p.name,noTranslate:true,keywords:[names?.people.find(n=>n.user_id===p.user_id)?.real_name??''].filter(Boolean)}))}/></div></PageHeader>
  {selection.bar}
  {people.error&&<ErrorState error={people.error} retry={people.reload}/>}
  {threads.error?<ErrorState error={threads.error} retry={threads.reload}/>
   :threads.loading?<div className="stack compact"><Skeleton className="skeleton-row"/><Skeleton className="skeleton-row"/></div>
   :!direct.length&&!thread?<Card><EmptyState title="No messages yet." action={<Button variant="secondary" onClick={start}>Start a message</Button>}>Start a conversation with someone on your team or a client.</EmptyState></Card>
   :<Card><ul className="list">{direct.map(t=><li key={t.id} {...selection.row(t.id)}>{selection.mark(t.id)}<button type="button" data-selection-open className="list-row" aria-current={thread?.conversation_id===t.id?'true':undefined} onClick={()=>setThread({conversation_id:t.id})}><span className="list-row-main"><span className="list-row-title"><span data-no-translate>{t.kind==='team'?'Team':<ContactName name={t.title} userId={t.participants?.find(id=>id!==me.user.id)}/>}</span>{t.unread_count>0&&<span className="nav-count" aria-label={`${t.unread_count} unread`}>{t.unread_count}</span>}</span></span></button></li>)}</ul></Card>}
  {thread&&<ThreadMessages key={`${me.user.id}:${JSON.stringify(thread)}`} thread={thread} onSent={id=>{setThread({conversation_id:id});void threads.reload();}}/>}
 </div>;
}
