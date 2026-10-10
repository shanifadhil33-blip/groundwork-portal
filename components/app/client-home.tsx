'use client';
import Link from 'next/link';
import { useApp } from './context';
import { useResource } from './resource';
import { ListSkeleton } from './work-order-list';
import { Card, EmptyState, ErrorState, RelativeTime, StatusBadge } from '../ui';
import { clientStatusLabels, type Page, type WorkOrder } from '../../lib/ui/work-orders';
export function ClientHome() {
  const {member}=useApp(), base=member?`/api/workspaces/${member.workspace_id}/work-orders`:null;
  const open=useResource<Page<WorkOrder>>(base?`${base}?status=open&status=scheduled&status=in_progress&status=waiting_on_parts&sort=updated_at&dir=desc&pageSize=6`:null);
  const recent=useResource<Page<WorkOrder>>(base?`${base}?sort=updated_at&dir=desc&pageSize=5`:null);
  function remember(){sessionStorage.setItem('work-orders-return','/work-orders');}
  return <div className="page stack"><div className="heading-row"><div><p className="muted">Your client portal</p><h1>{member?.client_name??'Your company'}</h1><p>Maintenance requests and updates from your service team.</p></div><Link className="button primary" href="/work-orders/new" onClick={remember}>New request</Link></div><Card className="stack"><div className="heading-row"><h2>My open requests</h2><Link className="back-link" href="/work-orders">View all requests</Link></div>{open.loading?<ListSkeleton/>:open.error?<ErrorState message="We couldn’t load your open requests." retry={open.reload}/>:open.data?.data.length?<><div className="stack">{open.data.data.map(o=><Link className="card work-card" href={`/work-orders/${o.id}`} key={o.id} onClick={remember}><strong>{o.title}</strong><StatusBadge status={o.status}>{clientStatusLabels[o.status]}</StatusBadge></Link>)}</div><p className="small muted">Showing {open.data.data.length} of {open.data.total} open requests</p></>:recent.loading?<ListSkeleton/>:<EmptyState title={recent.data?.total===0?'No requests yet.':'No open requests'}>{recent.data?.total===0?'Raise your first request.':'You’re all caught up. New requests will appear here.'}</EmptyState>}</Card><Card className="stack"><h2>Recent updates</h2>{recent.loading?<ListSkeleton/>:recent.error?<ErrorState message="We couldn’t load recent updates." retry={recent.reload}/>:recent.data?.data.length?<ul className="update-list">{recent.data.data.map(o=><li className="stack compact" key={o.id}><Link className="back-link" href={`/work-orders/${o.id}`} onClick={remember}>{o.title}</Link><StatusBadge status={o.status}>{clientStatusLabels[o.status]}</StatusBadge><span className="small muted">Updated <RelativeTime value={o.updated_at}/></span></li>)}</ul>:<p>No updates yet. Your team’s updates will appear here.</p>}</Card></div>;
}
