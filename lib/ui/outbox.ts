import { request, RequestError } from './api';
export type OutboxItem={id:string;url:string;body:string;label:string;created_at:string;error?:string};
export const outboxKey=(user:string,ws:string)=>`groundwork-outbox:${user}:${ws}`;
function allowedUrl(url:string,ws:string){const prefix=`/api/workspaces/${ws}`;return url.startsWith(prefix)&&/^(?:\/messages|\/work-orders\/[^/]+\/(?:comments|report))$/.test(url.slice(prefix.length));}
export function readOutbox(user:string,ws:string):OutboxItem[]{try{const value=JSON.parse(localStorage.getItem(outboxKey(user,ws))??'[]');return Array.isArray(value)?value.filter(v=>typeof v.id==='string'&&typeof v.body==='string'&&typeof v.url==='string'&&allowedUrl(v.url,ws)):[];}catch{return [];}}
function write(user:string,ws:string,items:OutboxItem[]){localStorage.setItem(outboxKey(user,ws),JSON.stringify(items));window.dispatchEvent(new Event('groundwork-outbox-changed'));}
export function enqueue(user:string,ws:string,item:Omit<OutboxItem,'created_at'>){if(!allowedUrl(item.url,ws))throw new Error('This action cannot wait in the Outbox.');const items=readOutbox(user,ws);if(!items.some(i=>i.id===item.id))write(user,ws,[...items,{...item,created_at:new Date().toISOString()}]);}
export function removeQueued(user:string,ws:string,id:string){write(user,ws,readOutbox(user,ws).filter(i=>i.id!==id));}
const locks=new Set<string>();
export async function flushOutbox(user:string,ws:string,active:()=>boolean=()=>true){
 const key=outboxKey(user,ws);if(locks.has(key)||navigator.onLine===false||!active())return;locks.add(key);
 try{for(const item of readOutbox(user,ws)){
  if(!active()||!online())break;if(item.error)continue;
  try{await request(item.url,{method:'POST',headers:{'Idempotency-Key':item.id,'groundwork-user':user},body:item.body});removeQueued(user,ws,item.id);window.dispatchEvent(new Event('groundwork-messages-changed'));window.dispatchEvent(new Event('groundwork-retry-resources'));}
  catch(e){if(e instanceof RequestError&&e.status===0)break;write(user,ws,readOutbox(user,ws).map(i=>i.id===item.id?{...i,error:e instanceof Error?e.message:'Could not send. Try again.'}:i));if(e instanceof RequestError&&[401,403].includes(e.status))break;}
 }}finally{locks.delete(key);}
}
export function retryQueued(user:string,ws:string,id:string){write(user,ws,readOutbox(user,ws).map(i=>i.id===id?{...i,error:undefined}:i));return flushOutbox(user,ws);}

function online(){return navigator.onLine!==false;}
