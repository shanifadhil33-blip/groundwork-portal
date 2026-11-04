'use client';
import { Translated } from './app-words';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { PRICE_HOLD, priceHeld, priceChangeLabel, type PriceChange } from '../../lib/price-change';
import { request, RequestError } from '../../lib/ui/api';
import { Badge, Button, Card, Dialog, ErrorState, Skeleton, useToast } from '../ui';
import { useApp } from './context';
import { useResource } from './resource';

export function PriceChangeCard({base,job,reload}:{base:string;job:{id:string;site_id?:string;status:string;price_change?:PriceChange|null};reload:()=>void}) {
 const {member}=useApp(),toast=useToast(),[mode,setMode]=useState<'finding'|'refused'|null>(null),[words,setWords]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submission=useRef({body:'',key:''}),change=job.price_change,held=priceHeld(change),active=!['done','cancelled'].includes(job.status),technician=member?.role==='technician';
 async function save(){if(!words.trim()||busy)return;setBusy(true);setError('');const body=JSON.stringify({words:words.trim()}),path=mode==='refused'?'/client-refused':'/price-change';if(submission.current.body!==path+body)submission.current={body:path+body,key:crypto.randomUUID()};try{await request(`${base}/work-orders/${job.id}${path}`,{method:'POST',body,headers:{'Idempotency-Key':submission.current.key}});toast('Saved');setMode(null);setWords('');reload();}catch(e){setError(e instanceof RequestError?e.message:'That did not save. Try again.');}finally{setBusy(false);}}
 if(!change&&!technician)return null;
 return <Translated><Card className="stack compact" style={{minWidth:0}}><h2>Price changed</h2>{change&&<><Badge tone={held?'warning':change.state==='refused'?'danger':'success'}>{priceChangeLabel(change)}</Badge>{held&&<p>{PRICE_HOLD}</p>}<p className="small">Technician statement</p><p className="preserve" data-no-translate style={{overflowWrap:'anywhere'}}>{change.technician_name}: {change.words}</p>{change.refusal_words&&<p className="preserve" data-no-translate>{change.refusal_words}</p>}{change.state==='refused'&&<><p>The owner decides any visit charge.</p>{member?.role==='client'&&job.site_id&&<Link className="button secondary" href={`/work-orders/new?site=${job.site_id}&from=${job.id}`}>New request</Link>}</>}</>}{technician&&active&&<div className="row"><Button variant="secondary" disabled={busy} onClick={()=>{submission.current={body:'',key:''};setMode('finding');setWords('');setError('');}}>Price changed</Button>{change&&['pending','declined'].includes(change.state)&&<Button variant="secondary" onClick={()=>{submission.current={body:'',key:''};setMode('refused');setWords('');setError('');}}>Client refused</Button>}</div>}
 <Dialog dirty={!!words.trim()} open={!!mode} onClose={()=>{if(!busy)setMode(null);}} busy={busy} title={mode==='refused'?'Client refused':'Price changed'} footer={<><Button variant="secondary" disabled={busy} onClick={()=>setMode(null)}>Cancel</Button><Button busy={busy} disabled={!words.trim()} onClick={()=>void save()}>{mode==='refused'?'Close visit':'Save'}</Button></>}><div className="stack"><p>{mode==='refused'?'The visit will close. The owner decides any visit charge.':PRICE_HOLD}</p><label className="field"><span>What happened?</span><textarea rows={4} maxLength={2000} value={words} onChange={e=>setWords(e.target.value)}/></label>{error&&<p role="alert" className="inline-error">{error}</p>}</div></Dialog></Card></Translated>;
}
export function WaitingPrices({base}:{base:string}) {
 const rows=useResource<{id:string;order_number:number;title:string;quote_status?:string|null;price_change?:PriceChange|null}[]>(`${base}/waiting-prices`);
 return <Translated><section className="stack"><h2>Waiting prices</h2>{rows.loading?<Skeleton/>:rows.error?<ErrorState retry={rows.reload}/>:rows.data?.length?<ul className="action-list">{rows.data.map(j=><li key={j.id}><div className="action-copy"><span className="order-number"><bdi data-no-translate>#{j.order_number}</bdi></span><strong data-no-translate>{j.title}</strong><Badge tone="warning">{j.price_change?priceChangeLabel(j.price_change):'Waiting for the client'}</Badge></div><Link className="button secondary" href={`/work-orders/${j.id}`}>Review price</Link></li>)}</ul>:<p>No prices waiting.</p>}</section></Translated>;
}
