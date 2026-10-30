'use client';
import { Translated } from './app-words';
import { WaitingPrices } from './price-change';
import { ContractTimes } from './dashboard';
import { DayPlan } from './day-plan-card';
import { OwnerAttention } from './owner-attention';
import type { ResponseWatchItem } from '../../lib/services/contract-response';
import { Greeting } from './greeting';
import { OwnerSummary, TodayJobs } from './owner-today';
import { useUiLang } from './use-ui-lang';
import { formatInLang } from '../../lib/date-lang';
import { useState } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import { Button,ErrorState } from '../ui';
import { post,RequestError } from '../../lib/ui/api';
export function OwnerOverview(){const {member,workspace,homeDocked}=useApp(),lang=useUiLang(),tz=workspace?.timezone??'Asia/Dubai',ws=`/api/workspaces/${member?.workspace_id}`,base=`/api/workspaces/${member?.workspace_id}/overview`,data=useResource<{contract_watch:ResponseWatchItem[];jobs_done:number;late_jobs:number;customer_issues:number;money_in:string;money_out:string;currency:string}>(member?.role==='admin'?base:null),[open,setOpen]=useState(false),[direction,setDirection]=useState('in'),[amount,setAmount]=useState(''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function save(){setBusy(true);setError('');try{await post(base,{direction,amount:Number(amount),note});await data.reload();setOpen(false);setAmount('');setNote('');}catch(e){setError(e instanceof RequestError?e.message:'We could not save that amount. Try again.');}finally{setBusy(false);}}
 if(member?.role!=='admin')return <Translated><p>Ask an admin to view the company overview.</p></Translated>;
 return <Translated><div className="page stack owner-home"><header className="ds-home-head"><p className="ds-date" data-no-translate suppressHydrationWarning>{formatInLang(new Date(),{weekday:'long',day:'numeric',month:'long',timeZone:tz},lang)}</p><Greeting tz={tz} mode="title"/><p className="sr-only">Company overview</p></header><OwnerSummary base={ws}/><div className="owner-home-grid"><div className="owner-home-main"><WaitingPrices base={ws}/><TodayJobs base={ws}/><div id="day-plan" className="owner-plan">{member?.workspace_id&&<DayPlan base={ws}/>}</div><ContractTimes items={data.data?.contract_watch??[]}/><Greeting tz={tz} mode="ask"/>{data.error?<ErrorState retry={data.reload}/>:data.data?<dl className="overview-grid">{[['Jobs done',data.data.jobs_done],['Late jobs',data.data.late_jobs],['Money in',`${data.data.currency} ${Number(data.data.money_in).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`],['Money out',`${data.data.currency} ${Number(data.data.money_out).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`],['Customer issues',data.data.customer_issues]].map(([label,value])=><div className="card" key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>:<p>Loading company overview…</p>}<p>Money in includes paid jobs and contract payments recorded here. Money out includes supplier costs and other amounts recorded here. Customer issues include jobs waiting for parts, jobs that could not be fixed and declined prices.</p><Button variant="secondary" onClick={()=>setOpen(v=>!v)}>Record money</Button>{open&&<form className="stack" onSubmit={e=>{e.preventDefault();void save();}}><label>Money<select value={direction} onChange={e=>setDirection(e.target.value)}><option value="in">In</option><option value="out">Out</option></select></label><label>Amount in {data.data?.currency}<input type="number" min="0" step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>Note<input maxLength={1000} value={note} onChange={e=>setNote(e.target.value)}/></label>{error&&<p role="alert">{error}</p>}<Button type="submit" busy={busy}>Save amount</Button></form>}</div>{!homeDocked&&<OwnerAttention/>}</div></div></Translated>;
}
