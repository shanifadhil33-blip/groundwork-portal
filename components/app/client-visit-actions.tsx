'use client';
import { useState } from 'react';
import { Button, Card, DatePicker } from '../ui';
import { post, request } from '../../lib/ui/api';

type Job = { id: string; status: string; updated_at: string; on_way_at?: string | null; started?: boolean };
type Pending = { id: string; summary: string; why: string };
export function ClientVisitActions({ base, job, reload }: { base: string; job: Job; reload: () => void }) {
  const [open,setOpen]=useState(false),[day,setDay]=useState<string>(),[slots,setSlots]=useState<string[]>([]),[zone,setZone]=useState('UTC'),[version,setVersion]=useState(job.updated_at),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const allowed=['open','scheduled'].includes(job.status)&&!job.on_way_at&&!job.started;
  if(!allowed)return null;
  async function find(date?:string){setBusy(true);setMessage('');setPending(null);try{const r=await request<{slots:string[];updated_at:string;timezone:string}>(`${base}/work-orders/${job.id}/visit-change${date?`?day=${date}`:''}`);setSlots(r.slots);setZone(r.timezone);setVersion(r.updated_at);setOpen(true);if(!r.slots.length)setMessage('There are no free visits in this period. Try another day.');}catch(e){setMessage(e instanceof Error?e.message:'Could not find visit times.');}finally{setBusy(false);}}
  async function prepare(tool:string,scheduled_for?:string){setBusy(true);setMessage('');try{const r=await post<{pending_action?:Pending;reply?:string}>(`${base}/work-orders/${job.id}/visit-change`,{tool,updated_at:tool==='cancel_visit'?job.updated_at:version,scheduled_for});setPending(r.pending_action??null);setMessage(r.reply??'');}catch(e){setMessage(e instanceof Error?e.message:'Could not prepare this change.');}finally{setBusy(false);}}
  async function confirm(){if(!pending)return;setBusy(true);try{const r=await post<{reply:string}>(`${base}/assistant`,{messages:[],confirm_action_id:pending.id});setMessage(r.reply);setPending(null);setOpen(false);reload();}catch(e){setMessage(e instanceof Error?e.message:'Could not save this change.');}finally{setBusy(false);}}
  return <div className="stack">{job.status==='scheduled'&&<Button variant="secondary" busy={busy} onClick={()=>void find(day)}>Reschedule</Button>}<Button variant="secondary" busy={busy} onClick={()=>void prepare('cancel_visit')}>Cancel</Button>{open&&<Card><p>Choose a free visit time</p><DatePicker label="Visit day" value={day} onChange={v=>{setDay(v);void find(v);}}/>{slots.map(at=><Button key={at} variant="secondary" disabled={busy} onClick={()=>void prepare('reschedule_visit',at)}>{new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short',timeZone:zone}).format(new Date(at))}</Button>)}</Card>}{pending&&<Card><p>{pending.summary}</p><p>{pending.why}</p><Button busy={busy} onClick={()=>void confirm()}>Yes</Button><Button variant="secondary" disabled={busy} onClick={()=>{void post(`${base}/assistant/log/${pending.id}/decline`,{});setPending(null);}}>Change</Button></Card>}{message&&<p role="status">{message}</p>}</div>;
}
