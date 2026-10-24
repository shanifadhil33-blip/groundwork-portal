'use client';
import { useSelection } from './selection';
import { NotificationMessage } from './notification-message';
import { useNotificationLanguage } from './notification-language';
import Link from 'next/link';
import { useApp } from './context';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { groupNotifications, openNotificationTarget, notificationTemplates, renderNotification, type NotificationTemplate } from '../../lib/ui/notifications';
import { request, post } from '../../lib/ui/api';
import { Button, BottomSheet, EmptyState, ErrorState, RelativeTime, Skeleton, useToast } from '../ui';
type Notification = { kind?: string; id: string; message: string; message_template?: NotificationTemplate; created_at: string; read_at: string | null; link_target: {entity:string;id:string}|null };
export function Notifications({ open, onClose, ws, onChange }: { open: boolean; onClose: () => void; ws: string; onChange: (delta?:number) => void }) {
  const {member,reload,me}=useApp();
  const {words}=useNotificationLanguage();
  const [data, setData] = useState<Notification[] | null>(null), [error, setError] = useState(false), [busy, setBusy] = useState<string | null>(null), [actionError, setActionError] = useState<string | null>(null), [total, setTotal] = useState(0), [page, setPage] = useState(1), [unreadCount,setUnreadCount]=useState(0);
  const router=useRouter(), toast = useToast(), lock=useRef(false), generation=useRef(0), lastLoaded=useRef(0), pending=useRef(false),itemsRef=useRef<Notification[]|null>(null);itemsRef.current=data;
  const load = useCallback(async () => { const run=++generation.current; pending.current=true; setError(false); try { const result = await request<{ data: Notification[]; total: number; unread_count:number }>(`/api/workspaces/${ws}/notifications?page=${page}`); if(run===generation.current){itemsRef.current=result.data;setData(result.data); setTotal(result.total); setUnreadCount(result.unread_count);lastLoaded.current=Date.now();} } catch { if(run===generation.current)setError(true); } finally {if(run===generation.current)pending.current=false;} }, [ws, page]);
  // Prefetch for this signed-in workspace and keep the list when the sheet closes.
  useEffect(() => { setData(null); lastLoaded.current=0; void load(); return()=>{++generation.current;}; }, [load]);
  // Refresh older results in the background; quick reopenings reuse the list.
  useEffect(()=>{if(open&&!pending.current&&Date.now()-lastLoaded.current>30_000)void load();},[open,load]);
  useEffect(()=>{const refresh=()=>{if(document.visibilityState==='visible')void load();};document.addEventListener('visibilitychange',refresh);return()=>document.removeEventListener('visibilitychange',refresh);},[load]);
  function applyRead(id:string,read:boolean){const item=itemsRef.current?.find(n=>n.id===id);const delta=item&&!!item.read_at!==read?(read?-1:1):0;const next=itemsRef.current?.map(n=>n.id===id?{...n,read_at:read?new Date().toISOString():null}:n)??null;itemsRef.current=next;setData(next);setUnreadCount(n=>n+delta);onChange(delta);}
  function groupMembers(ids:string[]) {
   return groupNotifications(itemsRef.current??[]).flatMap(({item,rest})=>ids.includes(item.id)?[item,...rest]:[]);
  }
  async function readGroups(ids:string[]) {
   const members=groupMembers(ids),unread=members.filter(n=>!n.read_at);
   if(!unread.length)return [];
   unread.forEach(n=>applyRead(n.id,true));
   try {await post(`/api/workspaces/${ws}/notifications/read`,{ids:members.map(n=>n.id)});}
   catch(e){unread.forEach(n=>applyRead(n.id,false));throw e;}
   return unread;
  }
  async function markGroups(ids:string[]) {
   if(lock.current)return false;lock.current=true;setBusy(ids[0]);setActionError(null);
   try {
    const unread=await readGroups(ids);
    toast('Notification marked as read.',{label:'Undo',onClick:async()=>{for(const n of unread){await post(`/api/workspaces/${ws}/notifications/${n.id}/unread`);applyRead(n.id,false);}}});
    return true;
   } catch {setActionError('We could not update this notification. Your change was undone. Try again.');return false;}
   finally {setBusy(null);lock.current=false;}
  }
  async function mark(id:string,read:boolean){
   if(lock.current)return false;lock.current=true;setBusy(id);setActionError(null);
   const previous=!!itemsRef.current?.find(n=>n.id===id)?.read_at;applyRead(id,read);
   try{await post(`/api/workspaces/${ws}/notifications/${id}/${read?'read':'unread'}`);toast(read?'Notification marked as read.':'Notification marked as unread.',{label:'Undo',onClick:async()=>{applyRead(id,previous);try{await post(`/api/workspaces/${ws}/notifications/${id}/${previous?'read':'unread'}`);}catch(e){applyRead(id,read);throw e;}}});return true;}
   catch{applyRead(id,previous);setActionError('We could not update this notification. Your change was undone. Try again.');return false;}
   finally{setBusy(null);lock.current=false;}
  }
  async function markAll(){if(lock.current)return;lock.current=true;setBusy('all');setActionError(null);const unread=itemsRef.current?.filter(n=>!n.read_at)??[];unread.forEach(n=>applyRead(n.id,true));try{await post(`/api/workspaces/${ws}/notifications/read-all`);toast('All notifications marked as read.',{label:'Undo',onClick:async()=>{for(const n of unread){applyRead(n.id,false);try{await post(`/api/workspaces/${ws}/notifications/${n.id}/unread`);}catch(e){applyRead(n.id,true);throw e;}}}});}catch{unread.forEach(n=>applyRead(n.id,false));setActionError('We could not update notifications. Your changes were undone. Try again.');}finally{setBusy(null);lock.current=false;}}
  const selection=useSelection(data?.map(n=>n.id)??[],[{label:'Mark read',run:async ids=>{if(!await markGroups(ids))throw new Error('Could not mark this notification as read. Try again.');}}]);
  useEffect(()=>{if(!open)selection.close();},[open]);
  async function openNotification(item:Notification) {
   if(lock.current||!item.link_target)return;
   lock.current=true;setBusy(item.id);setActionError(null);
   // Always check the group receipt, including when its lead is already read.
   try {await openNotificationTarget({...item,read_at:null},async()=>{const group=groupNotifications(itemsRef.current??[]).find(g=>g.item.id===item.id||g.rest.some(n=>n.id===item.id));await readGroups([group?.item.id??item.id]);},orderId=>{onClose();if(item.link_target?.entity==='members')reload();if(item.link_target?.entity==='documents'){window.location.assign(`/api/workspaces/${ws}/documents/${orderId}/file`);return;}router.push(item.link_target?.entity==='join_requests'?'/find-company':item.link_target?.entity==='team_space'?'/team-space':item.link_target?.entity==='conversations'?`/messages?thread=${orderId}`:item.link_target?.entity==='job_suggestions'?(member?.role==='client'?'/work-orders':'/suggestions'):item.link_target?.entity==='time_off'?(member?.role==='technician'?'/today':'/dashboard'):item.link_target?.entity==='members'?'/settings':item.message_template?.photoLink??`/work-orders/${orderId}`);});}
   catch {setActionError('We could not update this notification. Your change was undone. Try again.');}
   finally {lock.current=false;setBusy(null);}
  }
  return <BottomSheet open={open} onClose={onClose} title="Notifications" presentation="popover" busy={!!busy} headerActions={<Button variant="ghost" className="notification-read-all" disabled={!!busy || !unreadCount} busy={busy === 'all'} busyLabel="Marking as read…" onClick={()=>void markAll()}>Mark all as read</Button>}>{selection.bar}{actionError && <p className="inline-error" role="alert">{actionError}</p>}{error&&data&&<div role="status"><p>We couldn’t refresh notifications. Your last updates are shown below.</p><Button variant="ghost" onClick={()=>void load()}>Try again</Button></div>}{error&&!data ? <ErrorState retry={load} /> : !data || !words ? <div className="stack" style={{ marginTop: 'var(--s6)' }}>{[1, 2, 3].map(n => <Skeleton key={n} className="skeleton-card" />)}</div> : !data.length ? <EmptyState title="You're all caught up" action={<Link className="button secondary" href="/work-orders" onClick={onClose}>View jobs</Link>}>Your job updates will appear here.</EmptyState> : <><div className="notification-list">{groupNotifications(data).map(({item,rest}) => <article key={item.id} {...selection.row(item.id)} className={`notification-item ${!item.read_at ? 'unread' : ''}`}>{selection.mark(item.id)}{me.user.is_demo && ['day_plan','status_changed','on_the_way'].includes(item.kind??'') && <p>Demo preview. Nothing is sent to a device.</p>}{item.link_target?.entity==='work_order'||item.link_target?.entity==='work_orders'||item.link_target?.entity==='join_requests'||item.link_target?.entity==='documents'?<Link className="activity-link" href={item.link_target.entity==='documents'?`/api/workspaces/${ws}/documents/${item.link_target.id}/file`:item.link_target.entity==='join_requests'?'/find-company':item.message_template?.photoLink??`/work-orders/${item.link_target.id}`} aria-disabled={!!busy} onClick={event=>{event.preventDefault();void openNotification(item);}}><NotificationMessage message={item.message_template??{key:'{body}',values:{body:item.message}}} words={words}/></Link>:<p className="notification-text"><NotificationMessage message={item.message_template??{key:'{body}',values:{body:item.message}}} words={words}/></p>}{rest.length>0&&<details className="notification-more"><summary className="small muted" data-no-translate>{renderNotification({key:rest.length===1?notificationTemplates.more_one:notificationTemplates.more_many,values:{count:String(rest.length)}},words)}</summary><div className="stack compact">{rest.map(update=>update.link_target?<Link key={update.id} className="activity-link" href={update.message_template?.photoLink??`/work-orders/${update.link_target.id}`} onClick={event=>{event.preventDefault();void openNotification(update);}}><NotificationMessage message={update.message_template??{key:'{body}',values:{body:update.message}}} words={words}/></Link>:<p key={update.id}><NotificationMessage message={update.message_template??{key:'{body}',values:{body:update.message}}} words={words}/></p>)}</div></details>}<div className="row"><RelativeTime value={item.created_at} /><Button variant="ghost" size="sm" className="notification-read-toggle" disabled={!!busy} onClick={() => item.read_at ? mark(item.id, false) : markGroups([item.id])}>{item.read_at ? 'Mark as unread' : 'Mark as read'}</Button></div></article>)}</div>{total>25&&<div className="row" style={{ marginTop: 'var(--s4)' }}><small>Showing {(page - 1) * 25 + 1} to {Math.min(page * 25, total)} of {total}</small><Button variant="ghost" disabled={!!busy || page === 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="ghost" disabled={!!busy || page * 25 >= total} onClick={() => setPage(page + 1)}>Next</Button></div>}</>}</BottomSheet>;
}
