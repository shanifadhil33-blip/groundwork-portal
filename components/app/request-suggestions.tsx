'use client';
import { useVisiblePoll } from '../../lib/hooks/use-visible-poll';
import Link from 'next/link';
import { useEffect,useRef,useState } from 'react';
import { request } from '../../lib/ui/api';
import { useApp } from './context';
import { useResource } from './resource';
import { MoreHorizontal } from 'lucide-react';
import { Badge, Button, Card, Dropdown, ErrorState, RelativeTime, useToast } from '../ui';
export function RequestSuggestions(){
 const {member}=useApp(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const r=useResource<{data:{id:string;title:string;status:string;decline_reason:string|null;work_order_id:string|null;created_at:string}[]}>(base&&member?.role==='client'?`${base}/suggestions`:null);
 const version=useRef<string|null>(null),[asking,setAsking]=useState<string|null>(null),[busy,setBusy]=useState(false),toast=useToast();
 async function withdraw(id:string){if(!base)return;setBusy(true);try{await request(`${base}/suggestions/${id}`,{method:'DELETE'});setAsking(null);toast('Request withdrawn.');await r.reload();}catch{setAsking(null);toast('The office already answered this request.');await r.reload();}finally{setBusy(false);}}
 useVisiblePoll(r.reload,90000,member?.role==='client');
 useEffect(()=>{if(!r.data)return;const next=JSON.stringify(r.data.data.map(s=>[s.id,s.status,s.work_order_id,s.decline_reason]));if(version.current!==null&&version.current!==next)window.dispatchEvent(new Event('groundwork-suggestions-changed'));version.current=next;},[r.data]);
 if(member?.role!=='client')return null;
 if(r.error)return <ErrorState error={r.error} retry={r.reload}/>;
 const rows=r.data?.data.filter(s=>s.status!=='approved')??[];
 if(!rows.length)return null;
 return <section className="stack compact"><div className="section-title"><h2>Sent</h2></div><Card><ul className="list">{rows.map(s=><li key={s.id} className="list-row">
  <span className="list-row-main">
   <span className="list-row-title"><span data-no-translate>{s.title}</span><Badge tone={s.status==='pending'?'neutral':'danger'}>{s.status==='pending'?'Waiting for the office':'Not accepted'}</Badge></span>
   {s.decline_reason&&<span className="list-row-meta" data-no-translate>{s.decline_reason}</span>}
   <span className="list-row-meta"><span>Sent</span> <RelativeTime value={s.created_at}/></span>
   {asking===s.id&&<span className="row"><span>Withdraw this request?</span><Button variant="danger" size="sm" busy={busy} busyLabel="Withdrawing" onClick={()=>void withdraw(s.id)}>Withdraw</Button><Button variant="secondary" size="sm" onClick={()=>setAsking(null)}>Keep it</Button></span>}
  </span>
  {s.work_order_id?<Link className="text-link" href={`/work-orders/${s.work_order_id}`}>Open job</Link>:s.status==='pending'&&asking!==s.id&&<Dropdown label={`More for ${s.title}`} icon={<MoreHorizontal aria-hidden="true"/>} menuWidth={220} options={[{value:'withdraw',label:'Withdraw request'}]} onChange={()=>setAsking(s.id)}/>}
 </li>)}</ul></Card></section>;
}
