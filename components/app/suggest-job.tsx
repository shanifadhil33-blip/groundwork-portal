'use client';
import { DEFAULT_LANGUAGE } from '../../lib/languages';
import { useRef,useState } from 'react';
import { useRouter,useSearchParams } from 'next/navigation';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { AssistantComposer } from './assistant';
import { SharedPhotoUpload } from './shared-photo-upload';
import { post } from '../../lib/ui/api';
import { Button,ErrorState } from '../ui';
export function SuggestJob(){
 const {member}=useApp(),router=useRouter(),params=useSearchParams(),base=member?`/api/workspaces/${member.workspace_id}`:null;
 const sites=useResource<{id:string;name:string;client_id:string;client_name:string}[]>(base?`${base}/suggestion-sites`:null);
 const prefs=useResource<{language:string}>(base?'/api/me/preferences':null);
 const [site,setSite]=useState(params.get('site')??''),[client,setClient]=useState(params.get('client')??''),[problem,setProblem]=useState(''),[title,setTitle]=useState(''),[voice,setVoice]=useState(''),[photos,setPhotos]=useState<string[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),ref=useRef<HTMLTextAreaElement>(null);
 if(member?.role!=='technician'&&!member?.extra_roles?.includes('technician'))return <NoAccess/>;
 async function send(){if(!base||busy)return;setBusy(true);setError('');try{await post(`${base}/suggestions`,{title:title.trim()||problem.slice(0,200),problem,site_id:site,client_id:client,voice_note_text:voice||undefined,from_work_order_id:params.get('job')??undefined,photo_ids:photos});router.push('/today');}catch(e){setError(e instanceof Error?e.message:'Could not send. Try again.');setBusy(false);}}
 return <div className="page stack"><h1>Suggest a job</h1><p>Tell your supervisor what needs work.</p>{sites.error&&<ErrorState retry={sites.reload}/>}<label>Client<select value={client} onChange={e=>{setClient(e.target.value);setSite('');}}><option value="">Choose a client</option>{Array.from(new Map((sites.data??[]).map(s=>[s.client_id,s.client_name])).entries()).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label>Site<select value={site} onChange={e=>setSite(e.target.value)}><option value="">Choose a site</option>{sites.data?.filter(s=>s.client_id===client).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><label>Title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={200}/></label><label htmlFor="assistant-input">Problem</label>{base&&<><AssistantComposer input={problem} setInput={setProblem} inputRef={ref} busy={busy} blocked={!site} active submit={()=>void send()} ws={member.workspace_id} language={prefs.data?.language??DEFAULT_LANGUAGE} inputLabel="Problem" placeholder="Describe the problem or speak" onDictation={words=>setVoice(v=>[v,words].filter(Boolean).join(' '))}/><SharedPhotoUpload base={base} ids={photos} onChange={setPhotos}/></>}{error&&<p role="alert">{error}</p>}<Button busy={busy} disabled={!site||!problem.trim()} onClick={()=>void send()}>Suggest job</Button></div>;
}
