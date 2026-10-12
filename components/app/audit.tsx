'use client';
import { Suspense, useState } from 'react';
import { PageHeader, ResponsiveTable } from '../ui/layout';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { auditDiff, entityLabels, plural, demoEmail } from '../../lib/ui/polish';
import { scheduledInstant,localDate } from '../../lib/dates';
import { auditBadge } from '../../lib/ui/batch-five';
import type { Member } from '../../lib/ui/work-orders';
import { useApp } from './context';
import { useResource } from './resource';
import { Initials } from './dashboard';
import { Badge, Button, BottomSheet, DatePicker, Dropdown, EmptyState, ErrorState, LocalTime, PageSkeleton, Skeleton } from '../ui';
type Entry={id:string;at:string;actor:{id:string;name:string|null;email:string|null}|null;action:string;entity:string;entity_id:string;summary:string;before:unknown;after:unknown;actor_kind:string;via_token_name:string|null;link_target:{entity:string;id:string}|null};
function Attribution({item}:{item:Entry}){const badge=auditBadge(item);return badge?<Badge tone="info">{badge}</Badge>:null;}
function AuditDetail({url}:{url:string}){
 const {workspace}=useApp(),detail=useResource<Entry>(url);
 if(detail.loading)return <Skeleton className="skeleton-detail"/>;
 if(detail.error)return <ErrorState message="We couldn’t open this audit entry." retry={detail.reload}/>;
 if(!detail.data)return null;
 const item=detail.data,changes=auditDiff(item.before,item.after,workspace?.timezone);
 return <div className="stack"><h3>{item.summary}</h3><Attribution item={item}/><dl className="properties-list"><div><dt>Actor</dt><dd>{item.actor?.name??(demoEmail(item.actor?.email)||'System')}</dd></div><div><dt>Time</dt><dd><LocalTime short value={item.at}/></dd></div><div><dt>Item type</dt><dd>{entityLabels[item.entity]??'Workspace change'}</dd></div></dl>{item.link_target&&<Link className="button secondary" href={`/work-orders/${item.link_target.id}`}>Open job</Link>}<h3>Changes</h3>{changes.length?<ul className="audit-diff">{changes.map(diff=><li key={diff.field}><strong>{diff.field}:</strong> {diff.old} → {diff.new}</li>)}</ul>:<p>No displayable field changes.</p>}</div>;
}
export function auditDateBoundary(day:string,timezone:string,end=false){
 if(!end)return scheduledInstant(day,timezone,0)!;
 const next=new Date(Date.parse(`${day}T12:00:00Z`)+86400000).toISOString().slice(0,10);
 return new Date(Date.parse(scheduledInstant(next,timezone,0)!)-1).toISOString();
}
function AuditFeed(){
 const {member,workspace}=useApp(),router=useRouter(),path=usePathname(),query=useSearchParams(),base=`/api/workspaces/${member?.workspace_id}`;
 const actor=query.get('actor')??'',action=query.get('action')??'',entity=query.get('entity')??'',from=query.get('from')??'',to=query.get('to')??'',sort=query.get('sort')??'newest',page=Math.max(1,Number(query.get('page'))||1),[selected,setSelected]=useState<string|null>(null);
 const params=new URLSearchParams({page:String(page),pageSize:'25',sort});
 for(const [key,value] of Object.entries({actor,action,entity}))if(value)params.set(key,value);
 const validDay=(day:string)=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&localDate(day)===day,invalid=!!((from&&!validDay(from))||(to&&!validDay(to))||(from&&to&&from>to));
 if(from&&validDay(from))params.set('from',auditDateBoundary(from,workspace?.timezone??'Asia/Dubai'));
 if(to&&validDay(to))params.set('to',auditDateBoundary(to,workspace?.timezone??'Asia/Dubai',true));
 const feed=useResource<{data:Entry[];total:number}>(member&&member.role!=='client'&&!invalid?`${base}/audit?${params}`:null),members=useResource<Member[]>(member?.role==='admin'?`${base}/members`:null),filtered=!!(actor||action||entity||from||to),pages=Math.max(1,Math.ceil((feed.data?.total??0)/25));
 function change(key:string,value?:string){const next=new URLSearchParams(query.toString());if(value)next.set(key,value);else next.delete(key);if(key!=='page')next.delete('page');router.replace(`${path}${next.size?'?'+next:''}`,{scroll:false});}
 function clear(){const next=new URLSearchParams();if(query.get('sort'))next.set('sort',sort);router.replace(`${path}${next.size?'?'+next:''}`,{scroll:false});}
 return <div className="page stack batch-five"><PageHeader><div><h1>History</h1><p>{plural(feed.data?.total??0,'entry','entries')}{member?.role==='staff'?' · Only your changes':''}</p></div></PageHeader><section className="stack"><div className="filter-bar">{member?.role==='admin'&&<Dropdown label="Actor" value={actor} onChange={v=>change('actor',v)} options={[{value:'',label:'All actors'},...(members.data??[]).map(m=>({value:m.user_id,label:m.name??(demoEmail(m.email)||'Team member')}))]}/>}<Dropdown label="Action" value={action} onChange={v=>change('action',v)} options={[{value:'',label:'All actions'},...['insert','update','delete'].map(value=>({value,label:value==='insert'?'Created':value==='update'?'Updated':'Deleted'}))]}/><Dropdown label="Item type" value={entity} onChange={v=>change('entity',v)} options={[{value:'',label:'All item types'},...Object.entries(entityLabels).filter(([key])=>!['tokens','notifications','work_order_events'].includes(key)).map(([value,label])=>({value,label}))]}/><DatePicker label="From date" value={validDay(from)?from:undefined} onChange={v=>change('from',v)}/><DatePicker label="To date" value={validDay(to)?to:undefined} onChange={v=>change('to',v)}/><Dropdown label="Sort" value={sort} onChange={v=>change('sort',v)} options={[{value:'newest',label:'Newest first'},{value:'oldest',label:'Oldest first'}]}/><Button variant="ghost" onClick={clear}>Clear filters</Button></div>{members.error&&<ErrorState message="We couldn’t load the actor options." retry={members.reload}/>}</section>{invalid?<p className="inline-error" role="alert">Choose valid dates with the end on or after the start.</p>:feed.loading?<PageSkeleton/>:feed.error?<ErrorState message="We couldn’t load history." retry={feed.reload}/>:!feed.data?.data.length?<EmptyState title={filtered?'No entries match these filters':'No activity yet'} action={filtered?<Button variant="secondary" onClick={clear}>Clear filters</Button>:<Link className="button secondary" href="/work-orders">View jobs</Link>}>{filtered?'Try changing or clearing your filters.':'Workspace changes and their authors will appear here.'}</EmptyState>:<><ResponsiveTable><table><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Item</th></tr></thead><tbody>{feed.data.data.map(item=><tr className="clickable-row" key={item.id} onClick={()=>setSelected(item.id)}><td><LocalTime short value={item.at}/></td><td><span className="assignee-cell"><Initials name={item.actor?.name??'System'}/>{item.actor?.name??(demoEmail(item.actor?.email)||'System')}</span></td><td><button className="table-action" onClick={()=>setSelected(item.id)}>{item.summary}</button><Attribution item={item}/></td><td>{entityLabels[item.entity]??'Workspace change'}</td></tr>)}</tbody></table></ResponsiveTable><div className="pagination"><span>Page {page} of {pages}</span>{pages>1&&<div className="row"><Button variant="secondary" disabled={page===1} onClick={()=>change('page',String(page-1))}>Previous</Button><Button variant="secondary" disabled={page>=pages} onClick={()=>change('page',String(page+1))}>Next</Button></div>}</div></>}<BottomSheet open={!!selected} onClose={()=>setSelected(null)} title="Audit entry" presentation="drawer">{selected&&<AuditDetail url={`${base}/audit/${selected}`}/>}</BottomSheet></div>;
}
export function Audit(){return <Suspense fallback={<PageSkeleton/>}><AuditFeed/></Suspense>;}
