'use client';
import Link from 'next/link';
import { useEffect,useState } from 'react';
import { flushOutbox,readOutbox,retryQueued,type OutboxItem } from '../../lib/ui/outbox';
import { useApp } from './context';
import { Button } from '../ui';
export function Outbox(){
 const {me,member}=useApp(),user=me.user.id,ws=member?.workspace_id??'';
 const [items,setItems]=useState<OutboxItem[]>([]),[offline,setOffline]=useState(false),[error,setError]=useState('');
 useEffect(()=>{if(!ws)return;let active=true;const refresh=()=>{if(active){setItems(readOutbox(user,ws));setOffline(navigator.onLine===false);}};const flush=()=>{refresh();void flushOutbox(user,ws,()=>active).catch(()=>{if(active)setError('Could not update the Outbox on this phone. Your saved items are kept.');});};flush();const timer=setInterval(flush,15000);window.addEventListener('online',flush);window.addEventListener('offline',refresh);window.addEventListener('groundwork-outbox-changed',refresh);return()=>{active=false;clearInterval(timer);window.removeEventListener('online',flush);window.removeEventListener('offline',refresh);window.removeEventListener('groundwork-outbox-changed',refresh);};},[user,ws]);
 if(!offline&&!items.length&&!error)return null;
 return <section className="outbox stack compact" aria-label="Outbox">{error&&<p role="alert">{error}</p>}{offline&&<p role="status">Offline</p>}{items.length>0&&<><h2>Outbox</h2><ul>{items.map(item=><li key={item.id}><strong>{item.label}</strong><p className="preserve" data-no-translate>{queuedText(item)}</p>{item.error&&/\/work-orders\/([^/]+)\/report$/.test(item.url)&&<Link href={`/work-orders/${item.url.match(/\/work-orders\/([^/]+)\/report$/)![1]}`}>Open job</Link>}<p role={item.error?'alert':'status'}>{item.error??'Waiting to send'}</p>{item.error&&<Button variant="secondary" onClick={()=>{setError('');void retryQueued(user,ws,item.id).catch(()=>setError('Could not update the Outbox on this phone. Your saved items are kept.'));}}>Try again</Button>}</li>)}</ul></>}</section>;
}

function queuedText(item:OutboxItem){try{const body=JSON.parse(item.body);return typeof body.body==='string'?body.body:[body.problem,body.work].filter(v=>typeof v==='string').join(' · ');}catch{return '';}}
