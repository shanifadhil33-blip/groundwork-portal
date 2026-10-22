'use client';
import { useState } from 'react';
import { MoreVertical } from 'lucide-react';
import { request, RequestError } from '../../lib/ui/api';
import { Button, Card, ConfirmDialog, Dialog, Dropdown, useToast } from '../ui';
import { useResource } from './resource';
type Impact={jobs:number;open_jobs:number;notes:number;can_delete:boolean};
const n=(k:number,w:string)=>`${k} ${w}${k===1?'':'s'}`;
/**
 * Three dot menu on a team card (universal rule 17), admin only: Archive a former team member, keeping every job and note
 * with their name, with Undo. Delete only for someone added by mistake with no history; otherwise Archive is offered.
 */
export function MemberMenu({person,base,onChanged,archiveOnly=false,archived=false}:{person:{user_id:string;name:string|null};base:string;onChanged:()=>void;archiveOnly?:boolean;archived?:boolean}){
 const toast=useToast(),[impact,setImpact]=useState<Impact|null>(null),[mode,setMode]=useState<''|'archive'|'delete'>(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const url=`${base}/members/${person.user_id}`,who=person.name??'This person';
 async function check(m:'archive'|'delete'){setMode(m);setImpact(null);setError('');try{setImpact(await request<Impact>(`${url}/impact`));}catch(e){setError(e instanceof RequestError?e.message:'We could not check this. Try again.');}}
 async function archive(){setBusy(true);setError('');try{await request(`${url}/archive`,{method:'POST'});setMode('');onChanged();toast(`${who} is archived.`,{label:'Undo',onClick:async()=>{await request(`${url}/archive`,{method:'DELETE'});onChanged();toast(`${who} is back on the team.`);}});}catch(e){setError(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy(false);}}
 async function remove(){setBusy(true);setError('');try{await request(url,{method:'DELETE'});setMode('');onChanged();toast(`${who} is deleted.`);}catch(e){setError(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy(false);}}
 async function restore(){setBusy(true);setError('');try{await request(`${url}/archive`,{method:'DELETE'});onChanged();toast('Saved');}catch(e){setError(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy(false);}}
 const close=()=>setMode('');
 if(archived)return <span className="stack compact"><Button variant="secondary" busy={busy} onClick={()=>void restore()}>Unarchive</Button>{error&&<span className="inline-error" role="alert">{error}</span>}</span>;
 return <span className="record-actions">
  <Dropdown label={`More for ${who}`} icon={<MoreVertical size={18} aria-hidden="true"/>} menuWidth={200} options={archiveOnly?[{value:'archive',label:'Archive'}]:[{value:'archive',label:'Archive'},{value:'delete',label:'Delete'}]} onChange={v=>void check(v as 'archive'|'delete')}/>
  {mode&&!impact&&<Dialog open onClose={close} title={mode==='archive'?`Archive ${who}?`:`Delete ${who}?`} footer={<Button variant="secondary" onClick={close}>Close</Button>}>{error?<p role="alert" className="inline-error">{error}</p>:<p role="status">Checking their jobs…</p>}</Dialog>}
  {mode&&impact&&(mode==='delete'&&impact.can_delete
   ?<ConfirmDialog open danger onClose={close} title={`Delete ${who}?`} confirmLabel="Delete" busyLabel="Deleting…" busy={busy} error={error} onConfirm={()=>void remove()}>{who} has no jobs or notes, so they can be deleted. They lose access to this workspace. This can not be undone.</ConfirmDialog>
   :<ConfirmDialog open onClose={close} title={mode==='delete'?`${who} has job history`:`Archive ${who}?`} confirmLabel={mode==='delete'?'Archive instead':'Archive'} busyLabel="Archiving…" busy={busy} error={error} onConfirm={()=>void archive()}>
     {`${who} can no longer sign in here and leaves the Team page and job suggestions. Every job and note keeps their name (${n(impact.jobs,'job')}, ${n(impact.notes,'note')}).`}{impact.open_jobs?` ${n(impact.open_jobs,'open job')} will be unassigned so you can give them to someone else.`:''} You can unarchive later.</ConfirmDialog>)}
 </span>;
}
type Member={user_id:string;name:string|null;role:string;archived_at:string|null};
/** Archived team members with Unarchive. Unarchive also gives back their open jobs that nobody else has taken. */
export function ArchivedMembers({base,onChanged}:{base:string;onChanged:()=>void}){
 const members=useResource<Member[]>(`${base}/members`),toast=useToast(),[busy,setBusy]=useState('');
 const archived=(members.data??[]).filter(m=>m.archived_at&&m.role!=='client');
 if(!archived.length)return null;
 async function back(m:Member){setBusy(m.user_id);try{const r=await request<{jobs_back:number}>(`${base}/members/${m.user_id}/archive`,{method:'DELETE'});toast(`${m.name??'They'} ${m.name?'is':'are'} back on the team.${r.jobs_back?` ${n(r.jobs_back,'job')} given back.`:''}`);await members.reload();onChanged();}catch(e){toast(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy('');}}
 return <Card className="stack compact archived-members"><h2>Archived</h2><p className="small muted">Former team members. Their jobs and notes keep their name.</p><ul className="archived-list">{archived.map(m=><li key={m.user_id}><span>{m.name??'Team member'}</span><Button size="sm" variant="secondary" busy={busy===m.user_id} onClick={()=>void back(m)}>Unarchive</Button></li>)}</ul></Card>;
}
