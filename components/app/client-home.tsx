'use client';
import { plural } from '../../lib/ui/polish';
import Link from 'next/link';
import { useApp } from './context';
import { useResource } from './resource';
import { StatStrip } from './dashboard';
import { ListSkeleton } from './work-order-list';
import { Card, EmptyState, ErrorState, RelativeTime, StatusBadge } from '../ui';
import { clientStatusLabels, type Page, type WorkOrder } from '../../lib/ui/work-orders';
export function ClientHome() {
  const {member}=useApp(), base=member?`/api/workspaces/${member.workspace_id}/work-orders`:null;
  const open=useResource<Page<WorkOrder>>(base?`${base}?status=open&status=scheduled&status=in_progress&status=waiting_on_parts&sort=updated_at&dir=desc&pageSize=6`:null);
  const recent=useResource<Page<WorkOrder>>(base?`${base}?sort=updated_at&dir=desc&pageSize=5`:null);
  const counts=useResource<{by_status:Record<string,number>}>(member?`/api/workspaces/${member.workspace_id}/dashboard`:null);
  function remember(){sessionStorage.setItem('work-orders-return','/work-orders');}
  return <div className="page stack"><div className="heading-row"><div><h1>Requests</h1><p className="muted small">{member?.client_name}{recent.data&&` · ${plural(recent.data.total,'request')}`}</p></div><Link className="button primary" href="/work-orders/new" onClick={remember}>New request</Link></div>{counts.loading?<ListSkeleton/>:counts.error?<ErrorState message="We couldn’t load request counts." retry={counts.reload}/>:counts.data&&recent.data?.total!==0&&<StatStrip counts={counts.data.by_status} client/>}<Card className="stack"><div className="heading-row"><h2>My open requests</h2><Link className="back-link" href="/work-orders">View all requests</Link></div>{open.loading?<ListSkeleton/>:open.error?<ErrorState message="We couldn’t load your open requests." retry={open.reload}/>:open.data?.data.length?<><div className="compact-work-list">{open.data.data.map(o=><Link className="work-list-item" href={`/work-orders/${o.id}`} key={o.id} onClick={remember}><strong>{o.title}</strong><StatusBadge status={o.status}>{clientStatusLabels[o.status]}</StatusBadge></Link>)}</div><p className="small muted">Showing {open.data.data.length} of {plural(open.data.total,'open request')}</p></>:recent.loading?<ListSkeleton/>:<EmptyState title={recent.data?.total===0?'No requests yet':'No open requests'} action={<Link className="button primary" href="/work-orders/new" onClick={remember}>New request</Link>}>{recent.data?.total===0?'Send a request to your maintenance team.':'You’re all caught up. New requests will appear here.'}</EmptyState>}</Card><Card className="stack"><h2>Recent updates</h2>{recent.loading?<ListSkeleton/>:recent.error?<ErrorState message="We couldn’t load recent updates." retry={recent.reload}/>:recent.data?.data.length?<ul className="update-list">{recent.data.data.map(o=><li className="stack compact" key={o.id}><Link className="back-link" href={`/work-orders/${o.id}`} onClick={remember}>{o.title}</Link><StatusBadge status={o.status}>{clientStatusLabels[o.status]}</StatusBadge><span className="small muted">Updated <RelativeTime value={o.updated_at}/></span></li>)}</ul>:<p>No updates yet. Your team’s updates will appear here.</p>}</Card></div>;
}
