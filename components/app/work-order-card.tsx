import Link from 'next/link';
import { clientStatusLabels, isOverdue, label, statusLabels, workOrderTitle, type WorkOrder } from '../../lib/ui/work-orders';
import { Badge, LocalTime, StatusBadge } from '../ui';
export function WorkOrderCard({order:o, client, timezone, clientName, assigneeName, onOpen}: {order:WorkOrder;client:boolean;timezone?:string;clientName:string;assigneeName:string;onOpen:()=>void}) {
  const overdue=isOverdue(o,Date.now(),timezone);
  return <Link href={`/work-orders/${o.id}`} prefetch className="work-list-item" onClick={onOpen}>
    <div className="work-row-head"><span className="order-number">WO {o.order_number}</span>{overdue?<Badge tone="danger">Late</Badge>:<StatusBadge status={o.status}>{(client?clientStatusLabels:statusLabels)[o.status]}</StatusBadge>}</div><strong data-no-translate>{workOrderTitle(o)}</strong>
    <p data-no-translate className="small muted">{clientName} · {o.site_name??'Site unavailable'}</p>
    <div className="work-meta"><span className="assignee-cell" data-no-translate={assigneeName!=='Unassigned'?true:undefined}>{assigneeName}</span><span className="date-cell">{o.due_on?<>Due · <LocalTime short dateOnly value={o.due_on}/></>:'No due date'}</span></div>
    <div className="work-meta work-status-priority">{overdue&&<StatusBadge status={o.status}>{(client?clientStatusLabels:statusLabels)[o.status]}</StatusBadge>}<span className="small muted">Priority: {label(o.priority)}</span></div>
  </Link>;
}
