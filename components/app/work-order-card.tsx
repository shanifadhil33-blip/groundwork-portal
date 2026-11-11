import { ContactName } from './contact-name';
import Link from 'next/link';
import { clientStatusLabel, staffStatusLabel, isOverdue, label, statusLabels, workOrderTitle, type WorkOrder } from '../../lib/ui/work-orders';
import { Badge, LocalTime, StatusBadge } from '../ui';
export function WorkOrderCard({order:o, client, timezone, clientName, assigneeName, onOpen}: {order:WorkOrder;client:boolean;timezone?:string;clientName:string;assigneeName:string;onOpen:()=>void}) {
  const overdue=isOverdue(o,Date.now(),timezone);
  return <Link href={`/work-orders/${o.id}`} prefetch className="work-list-item" onClick={onOpen}>
    <div className="work-row-head"><span className="order-number"><bdi data-no-translate>#{o.order_number}</bdi></span>{overdue?<Badge tone="danger">Late</Badge>:<StatusBadge status={o.status}>{(client?clientStatusLabel(o):staffStatusLabel(o))}</StatusBadge>}</div><strong data-no-translate>{workOrderTitle(o)}</strong>{o.tenant_unit&&<span className="small muted"><span>Flat or unit</span>: <span data-no-translate>{o.tenant_unit}</span></span>}
    <p data-no-translate className="small muted">{clientName} · {o.site_name??'Site unavailable'}</p>
    <div className="work-meta"><span className="assignee-cell" data-no-translate={assigneeName!=='No technician yet'?true:undefined}>{assigneeName==='No technician yet'&&!o.assignee_id?'No technician yet':<ContactName name={assigneeName} userId={o.assignee_id}/>}</span><span className="date-cell">{o.due_on?<>Due · <LocalTime short dateOnly value={o.due_on}/></>:'No due date'}</span></div>
    <div className="work-meta work-status-priority">{overdue&&<StatusBadge status={o.status}>{(client?clientStatusLabel(o):staffStatusLabel(o))}</StatusBadge>}<span className="small muted">Priority: {label(o.priority)}</span></div>
  </Link>;
}
