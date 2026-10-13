'use client';
import { useState } from 'react';
import { useContactNames } from './contact-names-context';
import { request,RequestError } from '../../lib/ui/api';
import { BottomSheet,Button } from '../ui';
import type { Contact } from '../../lib/contact-names';
import { rolesLabel } from '../../lib/roles';
export function ContactName({name,userId}:{name:string|null|undefined;userId?:string|null}){
 const context=useContactNames(),base=context?.base;
 const [open,setOpen]=useState(false),[nickname,setNickname]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const person=context?.people.find(p=>userId?p.user_id===userId:p.name===name||p.real_name===name);
 async function save(clear=false){if(!person||busy)return;setBusy(true);setError('');try{await request(`${base}/${person.user_id}`,{method:'PATCH',body:JSON.stringify({nickname:clear?null:nickname.trim()})});await context?.reload();window.dispatchEvent(new Event('groundwork-contact-names'));setOpen(false);}catch(e){setError(e instanceof RequestError?e.message:'We could not save that name. Try again.');}finally{setBusy(false);}}
 if(!person)return <span data-no-translate>{name??'Team member'}</span>;
 const show=()=>{setNickname(person.nickname??'');setError('');setOpen(true);};
 return <><span className="contact-name" data-no-translate role="button" tabIndex={0} title={`Real name: ${person.real_name}`} onClick={e=>{e.preventDefault();e.stopPropagation();show();}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();show();}}}>{person.name}</span><BottomSheet open={open} onClose={()=>setOpen(false)} title="Contact name"><form className="stack" onSubmit={e=>{e.preventDefault();void save();}}><p>Real name: <strong data-no-translate>{person.real_name}</strong></p><p>{rolesLabel(person)}</p><label className="form-field">Save as...<input value={nickname} maxLength={60} required onChange={e=>setNickname(e.target.value)} /></label><p>This name is saved for you only.</p>{error&&<p className="inline-error" role="alert">{error}</p>}<div className="row"><Button type="submit" busy={busy} disabled={!nickname.trim()}>Save name</Button>{person.nickname&&<Button type="button" variant="secondary" disabled={busy} onClick={()=>void save(true)}>Use real name</Button>}</div></form></BottomSheet></>;
}

/** Only known contact names are made tappable. Arbitrary message text remains unchanged. */
export function ContactText({text}:{text:string}){
 const context=useContactNames();const names=[...new Set(context?.people.flatMap(p=>[p.name,p.real_name])??[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 if(!names.length)return <>{text}</>;
 const escaped=names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const parts=text.split(new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`,'u'));
 return <>{parts.map((part,i)=>names.includes(part)?<ContactName key={i} name={part}/>:<span key={i}>{part}</span>)}</>;
}
