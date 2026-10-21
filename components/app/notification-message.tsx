'use client';
import { ContactName } from './contact-name';
import { notificationParts, type NotificationTemplate } from '../../lib/ui/notifications';

export function NotificationMessage({message,words}:{message:NotificationTemplate;words:Record<string,string>}) {
 return <span data-no-translate>{notificationParts(message,words).map((part,index)=>part.parameter==='name'&&!message.translatedValues?.includes('name')?<ContactName key={index} name={part.text}/>:part.parameter?<bdi key={index} data-no-translate>{part.text}</bdi>:part.text)}</span>;
}
