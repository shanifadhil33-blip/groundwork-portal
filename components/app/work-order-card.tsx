import Link from 'next/link';
import { clientStatusLabels, isOverdue, label, statusLabels, workOrderTitle, type WorkOrder } from '../../lib/ui/work-orders';
import { Badge, LocalTime, StatusBadge } from '../ui';
export function WorkOrderCard({order:o, client, timezone, clientName, assigneeName, onOpen}: {order:WorkOrder;client:boolean;timezone?:string;clientName:string;assigneeName:string;onOpen:()=>void}) {
  const overdue=isOverdue(o,Date.now(),timezone);
  return <Link href={`/work-orders/${o.id}`} prefetch className="work-list-item" onClick={onOpen}>
    <span className="order-number">WO-{o.order_number}</span><strong>{workOrderTitle(o)}</strong>
    <div className="work-meta work-status-priority"><StatusBadge status={o.status}>{(client?clientStatusLabels:statusLabels)[o.status]}</StatusBadge><span className={`priority-text priority-${o.priority}`}><i/>{label(o.priority)}</span></div>
    <p className="small muted">{clientName} · {o.site_name??'Site unavailable'}</p>
    <div className="work-meta"><span className={`date-cell ${overdue?'overdue':''}`}>{o.due_on?<>Due · <LocalTime short dateOnly value={o.due_on}/></>:'No due date'}</span>{overdue&&<Badge tone="danger">Overdue</Badge>}</div>
    <p className="assignee-cell">Assigned to · {assigneeName}</p>
  </Link>;
}
