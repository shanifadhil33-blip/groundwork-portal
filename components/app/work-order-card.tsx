import Link from 'next/link';
import { clientStatusLabel, staffStatusLabel, isOverdue, workOrderTitle, type WorkOrder } from '../../lib/ui/work-orders';
import { Badge, LocalTime, StatusBadge } from '../ui';
/**
 * One job row on a phone (DESIGN-SPEC list row): the title and one status chip, then client and site,
 * then the technician and the visit. The whole row opens the job.
 */
export function WorkOrderCard({order:o, client, timezone, clientName, assigneeName, onOpen, warm}: {order:WorkOrder;client:boolean;timezone?:string;clientName:string;assigneeName:string;onOpen:()=>void;warm?:Record<string,()=>void>}) {
  const overdue=isOverdue(o,Date.now(),timezone);
  const place=[clientName,o.site_name??'Site unavailable'].filter(Boolean).join(' · ');
  return <Link href={`/work-orders/${o.id}`} prefetch className="work-list-item" onClick={onOpen} {...warm}>
    <div className="work-row-head"><strong data-no-translate>{workOrderTitle(o)}</strong>{overdue?<Badge tone="danger">Late</Badge>:<StatusBadge status={o.status}>{(client?clientStatusLabel(o):staffStatusLabel(o))}</StatusBadge>}</div>
    <p data-no-translate className="small muted">{place}</p>
    <p className="small muted work-meta-line"><span data-no-translate={o.assignee_id?true:undefined}>{o.assignee_id?assigneeName:'No technician yet'}</span>{' · '}{o.scheduled_for?<LocalTime short value={o.scheduled_for}/>:o.due_on?<>Due <LocalTime short dateOnly value={o.due_on}/></>:<span>No visit yet</span>}</p>
  </Link>;
}
