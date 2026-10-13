'use client';

import { PageHeader, ResponsiveTable } from '../ui/layout';
import { plural } from '../../lib/ui/polish';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { useApp } from './context';
import { useResource } from './resource';
import { AgentCard, NeedsAction } from './dashboard';
import { orderNumber, ListSkeleton } from './work-order-list';
import { Badge, EmptyState, ErrorState, LocalTime, RelativeTime, StatusBadge } from '../ui';
import { workOrderTitle, isOverdue, clientStatusLabels, type Page, type WorkOrder } from '../../lib/ui/work-orders';
export function ClientHome() {
  const {member,workspace}=useApp(), base=member?`/api/workspaces/${member.workspace_id}/work-orders`:null;
  const open=useResource<Page<WorkOrder>>(base?`${base}?status=open&status=scheduled&status=in_progress&status=waiting_on_parts&sort=updated_at&dir=desc&pageSize=6`:null);
  const recent=useResource<Page<WorkOrder>>(base?`${base}?sort=updated_at&dir=desc&pageSize=5`:null);
  function remember(){sessionStorage.setItem('work-orders-return','/work-orders');}
  return <div className="page stack client-home"><PageHeader><h1>Requests</h1><Link className="button primary" href="/work-orders/new" onClick={remember}><Plus size={16} aria-hidden="true"/>New request</Link></PageHeader>{member&&<NeedsAction base={`/api/workspaces/${member.workspace_id}`} client/>}<section className="stack"><div className="heading-row"><h2>Open requests</h2><Link className="back-link" href="/work-orders">See all</Link></div>{open.loading?<ListSkeleton/>:open.error?<ErrorState message="We couldn’t load your open requests." retry={open.reload}/>:open.data?.data.length?<><ul className="action-list client-requests">{open.data.data.map(o=><li key={o.id}><div className="action-copy"><span className="order-number">{orderNumber(o)}</span><Link href={`/work-orders/${o.id}`} onClick={remember} data-no-translate>{workOrderTitle(o)}</Link><span className="small muted">{o.scheduled_for?<LocalTime value={o.scheduled_for}/>: 'Unscheduled'}</span></div><div className="row"><StatusBadge status={o.status}>{clientStatusLabels[o.status]}</StatusBadge>{isOverdue(o,Date.now(),workspace?.timezone)&&<Badge tone="danger">Late</Badge>}</div></li>)}</ul><p className="small muted">Showing {open.data.data.length} of {plural(open.data.total,'open request')}</p></>:recent.loading?<ListSkeleton/>:<EmptyState title={recent.data?.total===0?'No requests yet':'No open requests'} action={<Link className="button primary" href="/work-orders/new" onClick={remember}>New request</Link>}>{recent.data?.total===0?'Send a request to your maintenance team.':'You’re all caught up. New requests will appear here.'}</EmptyState>}</section><section className="stack"><h2>Recent updates</h2>{recent.loading?<ListSkeleton/>:recent.error?<ErrorState message="We couldn’t load recent updates." retry={recent.reload}/>:recent.data?.data.length?<ResponsiveTable><table><thead><tr><th>Request</th><th>Latest update</th></tr></thead><tbody>{recent.data.data.map(o=><tr key={o.id}><td><span className="order-number">{orderNumber(o)}</span><Link href={`/work-orders/${o.id}`} onClick={remember} data-no-translate>{workOrderTitle(o)}</Link></td><td><div className="request-update-meta"><StatusBadge status={o.status}>{clientStatusLabels[o.status]}</StatusBadge>{isOverdue(o,Date.now(),workspace?.timezone)&&<Badge tone="danger">Late</Badge>}<span className="small muted">Updated <RelativeTime value={o.updated_at}/></span></div></td></tr>)}</tbody></table></ResponsiveTable>:<EmptyState title="No updates yet" action={<Link className="button secondary" href="/work-orders/new" onClick={remember}>New request</Link>}>Your team’s updates will appear here.</EmptyState>}</section><AgentCard/></div>;
}
