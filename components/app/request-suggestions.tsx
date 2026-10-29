'use client';
import { useVisiblePoll } from '../../lib/hooks/use-visible-poll';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { request } from '../../lib/ui/api';
import { useApp } from './context';
import { useResource } from './resource';
import { Button, ErrorState, RelativeTime, useToast } from '../ui';
export function RequestSuggestions(){
 const {member}=useApp(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const r=useResource<{data:{id:string;title:string;status:string;decline_reason:string|null;work_order_id:string|null;created_at:string}[]}>(base&&member?.role==='client'?`${base}/suggestions`:null);
 const version=useRef<string|null>(null),[asking,setAsking]=useState<string|null>(null),[busy,setBusy]=useState(false),toast=useToast();
 async function withdraw(id:string){if(!base)return;setBusy(true);try{await request(`${base}/suggestions/${id}`,{method:'DELETE'});setAsking(null);toast('Request withdrawn.');await r.reload();}catch{setAsking(null);toast('The office already answered this request.');await r.reload();}finally{setBusy(false);}}
 useVisiblePoll(r.reload,90000,member?.role==='client');
 useEffect(()=>{if(!r.data)return;const next=JSON.stringify(r.data.data.map(s=>[s.id,s.status,s.work_order_id,s.decline_reason]));if(version.current!==null&&version.current!==next)window.dispatchEvent(new Event('groundwork-suggestions-changed'));version.current=next;},[r.data]);
 if(member?.role!=='client')return null;
 if(r.error)return <ErrorState retry={r.reload}/>;
 const rows=r.data?.data.filter(s=>s.status!=='approved')??[];
 if(!rows.length)return null;
 return <section className="stack"><h2>Your requests</h2><ul className="action-list">{rows.map(s=><li key={s.id}><div className="stack compact"><strong data-no-translate>{s.title}</strong><span>{s.status==='pending'?'Request Received':'Not accepted'}</span>{s.decline_reason&&<p data-no-translate>{s.decline_reason}</p>}<RelativeTime value={s.created_at}/>{s.work_order_id&&<Link href={`/work-orders/${s.work_order_id}`}>Open job</Link>}{s.status==='pending'&&(asking===s.id?<div className="stack compact"><span>Withdraw this request?</span><div className="withdraw-actions"><Button variant="danger" size="sm" busy={busy} onClick={()=>void withdraw(s.id)}>Withdraw</Button><Button variant="secondary" size="sm" onClick={()=>setAsking(null)}>Keep it</Button></div></div>:<Button variant="ghost" size="sm" onClick={()=>setAsking(s.id)}>Withdraw request</Button>)}</div></li>)}</ul></section>;
}
