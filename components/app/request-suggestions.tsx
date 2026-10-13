'use client';
import Link from 'next/link';
import { useApp } from './context';
import { useResource } from './resource';
import { ErrorState, RelativeTime } from '../ui';
export function RequestSuggestions(){
 const {member}=useApp(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const r=useResource<{data:{id:string;title:string;status:string;decline_reason:string|null;work_order_id:string|null;created_at:string}[]}>(base&&member?.role==='client'?`${base}/suggestions`:null);
 if(member?.role!=='client')return null;
 if(r.error)return <ErrorState retry={r.reload}/>;
 const rows=r.data?.data.filter(s=>s.status!=='approved')??[];
 if(!rows.length)return null;
 return <section className="stack"><h2>Your requests</h2><ul className="action-list">{rows.map(s=><li key={s.id}><div className="stack compact"><strong data-no-translate>{s.title}</strong><span>{s.status==='pending'?'Request Received':'Not accepted'}</span>{s.decline_reason&&<p data-no-translate>{s.decline_reason}</p>}<RelativeTime value={s.created_at}/>{s.work_order_id&&<Link href={`/work-orders/${s.work_order_id}`}>Open job</Link>}</div></li>)}</ul></section>;
}
