'use client';
import { useRef,useState } from 'react';
import { Button } from '../ui';
import { shrinkPhoto } from './job-photos';
import { post } from '../../lib/ui/api';
export function SharedPhotoUpload({base,ids,onChange}:{base:string;ids:string[];onChange:(ids:string[])=>void}){
 const input=useRef<HTMLInputElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 async function pick(file?:File){if(!file)return;setBusy(true);setError('');try{const photo=await shrinkPhoto(file),r=await post<{id:string}>(`${base}/photos`,photo);onChange([...ids,r.id]);}catch{setError('Could not add the photo. Try again.');}finally{setBusy(false);}}
 return <div className="stack compact"><input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={e=>void pick(e.target.files?.[0])}/><Button variant="secondary" disabled={ids.length>=4} busy={busy} onClick={()=>input.current?.click()}>Add photo</Button><div className="photo-row">{ids.map(id=><button key={id} type="button" className="photo-thumb" aria-label="Remove photo from draft" onClick={()=>onChange(ids.filter(p=>p!==id))}><img src={`${base}/photos/${id}`} width={80} height={80} alt="Photo"/></button>)}</div>{error&&<p role="alert">{error}</p>}</div>;
}
