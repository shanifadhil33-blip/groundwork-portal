'use client';
import { useContactNames } from './contact-names-context';
/**
 * A person's name, as plain text. The tap to rename sheet is gone (bug 123): a nickname for a coworker
 * was a confusing extra. A saved nickname still shows; real names show otherwise.
 */
export function ContactName({name,userId}:{name:string|null|undefined;userId?:string|null}){
 const context=useContactNames();
 const person=context?.people.find(p=>userId?p.user_id===userId:p.name===name||p.real_name===name);
 return <span data-no-translate>{person?.name??name??'Team member'}</span>;
}

/** Only known contact names are made tappable. Arbitrary message text remains unchanged. */
export function ContactText({text}:{text:string}){
 const context=useContactNames();const names=[...new Set(context?.people.flatMap(p=>[p.name,p.real_name])??[])].filter(Boolean).sort((a,b)=>b.length-a.length);
 if(!names.length)return <>{text}</>;
 const escaped=names.map(n=>n.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 const parts=text.split(new RegExp(`(?<![\\p{L}\\p{N}])(${escaped.join('|')})(?![\\p{L}\\p{N}])`,'u'));
 return <>{parts.map((part,i)=>names.includes(part)?<ContactName key={i} name={part}/>:<span key={i}>{part}</span>)}</>;
}
