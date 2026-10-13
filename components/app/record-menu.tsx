'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical } from 'lucide-react';
import { request, RequestError } from '../../lib/ui/api';
import { Button, ConfirmDialog, Dialog, Dropdown, useToast } from '../ui';
type Impact={jobs:number;sites?:number;users?:number;invites?:number};
const n=(k:number,w:string)=>`${k} ${w}${k===1?'':'s'}`;
/**
 * The three dot menu on every client and site card: Info, New job here, View history, Edit, Archive or Unarchive, Delete.
 * Delete always checks what is linked first. A record with jobs is archived, never deleted, so history is never lost.
 * The server checks every permission again; supervisors see only the view options.
 */
export function RecordMenu({kind,record,base,admin,clientId,onInfo,onEdit,onChanged,afterDelete}:{kind:'client'|'site';record:{id:string;name:string;archived_at?:string|null};base:string;admin:boolean;clientId?:string;onInfo:()=>void;onEdit:()=>void;onChanged:()=>void;afterDelete?:()=>void}){
 const router=useRouter(),toast=useToast(),[impact,setImpact]=useState<Impact|null>(null),[asking,setAsking]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[archiving,setArchiving]=useState(false);
 const url=`${base}/${kind==='client'?'clients':'sites'}/${record.id}`,noun=kind==='client'?'client':'site',archived=!!record.archived_at;
 const options=[{value:'info',label:'Info'},...(!archived?[{value:'new',label:'New job here'}]:[]),{value:'history',label:'View history'},...(admin&&!archived?[{value:'edit',label:'Edit'}]:[]),...(admin?[{value:archived?'unarchive':'archive',label:archived?'Unarchive':'Archive',divider:true},{value:'delete',label:'Delete'}]:[])];
 async function ask(){setAsking(true);setImpact(null);setError('');try{setImpact(await request<Impact>(`${url}/impact`));}catch(e){setError(e instanceof RequestError?e.message:'We could not check what is linked. Try again.');}}
 async function run(method:'DELETE'|'POST',path:string,done:string){setBusy(true);setError('');try{await request(path,{method});setAsking(false);setArchiving(false);toast(done);if(method==='DELETE'&&path===url)afterDelete?.();onChanged();}catch(e){setError(e instanceof RequestError?e.message:'That did not work. Try again.');}finally{setBusy(false);}}
 async function unarchive(){try{await request(`${url}/archive`,{method:'DELETE'});toast(`${record.name} is back in your lists.`);onChanged();}catch(e){toast(e instanceof RequestError?e.message:'That did not work. Try again.');}}
 function pick(v:string){
  if(v==='info')onInfo();else if(v==='edit')onEdit();
  else if(v==='new')router.push(kind==='client'?`/work-orders/new?client=${record.id}`:`/work-orders/new?client=${clientId}&site=${record.id}`);
  else if(v==='history')router.push(kind==='client'?`/work-orders?client_id=${record.id}&active=false`:`/work-orders?client_id=${clientId}&site_id=${record.id}&active=false`);
  else if(v==='archive'){setError('');setArchiving(true);}else if(v==='unarchive')void unarchive();else if(v==='delete')void ask();
 }
 const linked=impact?[impact.sites!=null&&n(impact.sites,'site'),n(impact.jobs,'job'),impact.users!=null&&n(impact.users,'client user')].filter(Boolean).join(', '):'';
 const blockedByUsers=!!impact&&!impact.jobs&&!!impact.users;
 return <span className="record-actions" onClick={e=>e.stopPropagation()}>
  <Dropdown label={`More for ${record.name}`} icon={<MoreVertical size={18} aria-hidden="true"/>} menuWidth={200} options={options} onChange={pick}/>
  <ConfirmDialog open={archiving} onClose={()=>setArchiving(false)} title={`Archive ${record.name}?`} confirmLabel="Archive" busyLabel="Archiving…" busy={busy} error={error} onConfirm={()=>void run('POST',`${url}/archive`,`${record.name} is archived.`)}>It leaves your daily lists and can not get new jobs. Every job and record stays. You can unarchive it any time from Archived.</ConfirmDialog>
  {asking&&!impact&&<Dialog open onClose={()=>setAsking(false)} title={`Delete ${record.name}?`} footer={<Button variant="secondary" onClick={()=>setAsking(false)}>Close</Button>}>{error?<p role="alert" className="inline-error">{error}</p>:<p role="status">Checking what is linked…</p>}</Dialog>}
  {asking&&impact&&(impact.jobs>0
   ?<ConfirmDialog open onClose={()=>setAsking(false)} title={`${record.name} has job history`} confirmLabel={archived?'Keep it archived':'Archive instead'} busyLabel="Archiving…" busy={busy} error={error} onConfirm={()=>archived?setAsking(false):void run('POST',`${url}/archive`,`${record.name} is archived.`)}>This {noun} has {linked}, so it can not be deleted. That keeps the job history safe. {archived?'It is already archived.':'Archive it instead: it leaves your daily lists and every job stays.'}</ConfirmDialog>
   :blockedByUsers
   ?<Dialog open onClose={()=>setAsking(false)} title={`${record.name} can not be deleted yet`} footer={<Button variant="secondary" onClick={()=>setAsking(false)}>Close</Button>}><p>This client has {n(impact.users!,'client user')}. Remove them in Settings, Members first, or archive the client.</p></Dialog>
   :<ConfirmDialog open danger onClose={()=>setAsking(false)} title={`Delete ${record.name}?`} confirmLabel="Delete" busyLabel="Deleting…" busy={busy} error={error} onConfirm={()=>void run('DELETE',url,`${record.name} is deleted.`)}>This {noun} has no jobs.{kind==='client'&&impact.sites?` Its ${n(impact.sites,'site')}${impact.invites?` and ${n(impact.invites,'open invite')}`:''} will be deleted too.`:kind==='client'&&impact.invites?` Its ${n(impact.invites,'open invite')} will be deleted too.`:''} This can not be undone.</ConfirmDialog>)}
 </span>;
}
