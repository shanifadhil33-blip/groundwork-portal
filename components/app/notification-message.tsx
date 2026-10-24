'use client';
import { useContext } from 'react';
import { AppContext } from './context';
import { isDemoFixtureCopy } from '../../lib/demo-proof-copy';
import { ContactName, ContactText } from './contact-name';
import { notificationParts, type NotificationTemplate } from '../../lib/ui/notifications';

export function NotificationMessage({message,words,language}:{message:NotificationTemplate;words:Record<string,string>;language?:string}) {
 const demo = !!useContext(AppContext)?.workspace?.is_demo;
 const values = {...message.values};
 if (demo && values.job) {
  const key = 'job', value = values.job;
  const prefix = value.match(/^(WO[- ]\d+ )/)?.[0] ?? '';
  const source = value.slice(prefix.length);
  if (isDemoFixtureCopy(source)) values[key] = prefix + (words[source] ?? source);
 }
 // Unknown bodies remain visible to the runtime translator, with user data protected.
 if(message.runtime||message.key==='{body}'){
  const body=message.values.body??'';
  const protectedValues=[message.values.name,message.values.job].filter((value):value is string=>!!value).sort((a,b)=>b.length-a.length);
  const pattern=protectedValues.map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|');
  const parts=pattern?body.split(new RegExp(`(${pattern})`,'g')):[body];
  return <span>{parts.map((part,index)=>protectedValues.includes(part)?<bdi key={index} data-no-translate>{part}</bdi>:<ContactText key={index} text={part}/>)}</span>;
 }
 return <span data-no-translate>{notificationParts({...message,values},words,language).map((part,index)=>part.parameter==='name'&&!message.translatedValues?.includes('name')?<ContactName key={index} name={part.text}/>:part.parameter?<bdi key={index} data-no-translate>{part.text}</bdi>:part.text)}</span>;
}
