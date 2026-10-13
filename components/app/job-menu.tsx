'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical } from 'lucide-react';
import { request, RequestError } from '../../lib/ui/api';
import { ConfirmDialog, Dialog, Button, Dropdown, useToast } from '../ui';
type Job={id:string;order_number?:number|null;title?:string|null;status:string;updated_at:string};
type Impact={notes:number;photos:number;parts:number;changes:number;can_delete:boolean};
const n=(k:number,w:string)=>`${k} ${w}${k===1?'':'s'}`;
/**
 * The three dot menu on a job (universal rule 17): Open, Cancel job with Undo, Restore a cancelled job, and Delete only
 * for a job made by mistake with no activity. A job with history is cancelled, never deleted. Office only; the server checks again.
 */
export function JobMenu({job,base,open=true,onChanged,afterDelete}:{job:Job;base:string;open?:boolean;onChanged:()=>void;afterDelete?:()=>void}){
 const router=useRouter(),toast=useToast(),[cancel,setCancel]=useState(false),[impact,setImpact]=useState<Impact|null>(null),[asking,setAsking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=`${base}/work-orders/${job.id}`,label=job.order_number?`WO-${job.order_number}`:'This job',closed=job.status==='done'||job.status==='cancelled';
 const options=[...(open?[{value:'open',label:'Open'}]:[]),...(job.status==='cancelled'?[{value:'restore',label:'Restore job'}]:[]),...(!closed?[{value:'cancel',label:'Cancel job',divider:open}]:[]),{value:'delete',label:'Delete',divider:closed}];
 async function restore(status?:string){await request(`${url}/restore`,{method:'POST',body:JSON.stringify(status?{status}:{})});onChanged();}
 async function doCancel(){setBusy(true);setError('');const prev=job.status;try{await request(url,{method:'PATCH',body:JSON.stringify({status:'cancelled',updated_at:job.updated_at})});setCancel(false);onChanged();toast(`${label} is cancelled.`,{label:'Undo',onClick:async()=>{await restore(prev);toast(`${label} is back.`);}});}catch(e){setError(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy(false);}}
 async function ask(){setAsking(true);setImpact(null);setError('');try{setImpact(await request<Impact>(`${url}/impact`));}catch(e){setError(e instanceof RequestError?e.message:'We could not check this job. Try again.');}}
 async function doDelete(){setBusy(true);setError('');try{await request(url,{method:'DELETE'});setAsking(false);toast(`${label} is deleted.`);afterDelete?afterDelete():onChanged();}catch(e){setError(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy(false);}}
 function pick(v:string){if(v==='open')router.push(`/work-orders/${job.id}`);else if(v==='cancel'){setError('');setCancel(true);}else if(v==='restore')void restore().then(()=>toast(`${label} is back.`)).catch(e=>toast(e instanceof RequestError?e.message:'That did not work. Try again.'));else if(v==='delete')void ask();}
 const history=impact?[impact.notes&&n(impact.notes,'note'),impact.photos&&n(impact.photos,'photo'),impact.parts&&n(impact.parts,'parts order'),impact.changes&&n(impact.changes,'change')].filter(Boolean).join(', '):'';
 return <span className="record-actions" onClick={e=>e.stopPropagation()}>
  <Dropdown label={`More for ${label}`} icon={<MoreVertical size={18} aria-hidden="true"/>} menuWidth={200} options={options} onChange={pick}/>
  <ConfirmDialog open={cancel} onClose={()=>setCancel(false)} title={`Cancel ${label}?`} confirmLabel="Cancel job" busyLabel="Cancelling…" busy={busy} error={error} onConfirm={()=>void doCancel()}>It leaves the open lists and keeps all its history. You can undo this or restore it later.</ConfirmDialog>
  {asking&&!impact&&<Dialog open onClose={()=>setAsking(false)} title={`Delete ${label}?`} footer={<Button variant="secondary" onClick={()=>setAsking(false)}>Close</Button>}>{error?<p role="alert" className="inline-error">{error}</p>:<p role="status">Checking this job…</p>}</Dialog>}
  {asking&&impact&&(impact.can_delete
   ?<ConfirmDialog open danger onClose={()=>setAsking(false)} title={`Delete ${label}?`} confirmLabel="Delete" busyLabel="Deleting…" busy={busy} error={error} onConfirm={()=>void doDelete()}>This job has no activity yet, so it can be deleted. This can not be undone.</ConfirmDialog>
   :closed
   ?<Dialog open onClose={()=>setAsking(false)} title={`${label} is kept for history`} footer={<Button variant="secondary" onClick={()=>setAsking(false)}>Close</Button>}><p>{job.status==='done'?'Finished jobs stay in reports and history.':'Cancelled jobs with activity stay in history.'}{history?` It has ${history}.`:''}</p></Dialog>
   :<ConfirmDialog open onClose={()=>setAsking(false)} title={`${label} has history`} confirmLabel="Cancel job instead" busyLabel="Cancelling…" busy={busy} error={error} onConfirm={()=>void doCancel()}>{history?`It has ${history}, or someone is assigned.`:'Someone is assigned or it has moved on.'} It is kept for history. Cancel it instead, and you can undo that.</ConfirmDialog>)}
 </span>;
}
