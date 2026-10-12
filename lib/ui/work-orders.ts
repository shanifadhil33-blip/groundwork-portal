import { localDate, formatDate, scheduledInstant, workspaceTimezone } from '../dates';
export { isOverdue } from '../dates';
export const statusLabels: Record<string, string> = { open: 'Open', scheduled: 'Scheduled', in_progress: 'In Progress', waiting_on_parts: 'Waiting on Parts', done: 'Done', cancelled: 'Cancelled' };
export const statusTransitions: Record<string, string[]> = { open: ['scheduled', 'cancelled'], scheduled: ['in_progress', 'cancelled'], in_progress: ['waiting_on_parts', 'done', 'cancelled'], waiting_on_parts: ['in_progress', 'done', 'cancelled'], done: [], cancelled: [] };
export const priorities = ['low', 'normal', 'high', 'urgent'];
export const label = (value: string) => statusLabels[value] ?? value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
import type { ClientRecord, SiteRecord } from '../records';
export type Client = ClientRecord;
export type Site = SiteRecord;
export type Member = { user_id: string; role: string; client_id: string | null; name: string | null; email: string | null };
type EventAttribution = { work_order_title?:string|null; actor_kind?:string; via_token_name?:string|null };
export type Comment = EventAttribution & { id: string; body: string; visibility: 'client' | 'internal'; author_id: string; created_at: string };
export type WorkOrder = { trade?: string | null; site_name?: string; client_name?: string; assignee_name?: string | null; id: string; order_number: number; due_on: string | null; title: string; description: string; client_id: string; site_id: string; status: string; priority: string; assignee_id: string | null; scheduled_for: string | null; updated_at: string; created_at: string };
export type Detail = WorkOrder & { client: Client; site: Site; assignee: { id: string; name?: string } | null; comments: Comment[]; timeline: (EventAttribution & { id: string; kind: string; actor_id: string | null; body?: string; details?: {to_status?:string;from_status?:string;scheduled_for?:string|null;due_on?:string|null;assignee_name?:string|null;priority?:string|null;title_changed?:boolean;description_changed?:boolean}; from_status?: string; to_status?: string; created_at: string })[] };
export type Page<T> = { data: T[]; total: number; page: number; pageSize: number };
export function sortOrders(orders: WorkOrder[], sort: string, dir: string) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...orders].sort((a, b) => {
    let difference = 0;
    if (sort === 'priority') difference = priorities.indexOf(a.priority) - priorities.indexOf(b.priority);
    else if (sort === 'title') difference = a.title.localeCompare(b.title);
    else { const av = a[sort as 'updated_at' | 'created_at' | 'scheduled_for' | 'due_on'], bv = b[sort as 'updated_at' | 'created_at' | 'scheduled_for' | 'due_on']; if (!av || !bv) { if (av !== bv) return av ? -1 : 1; } else difference = new Date(av).getTime() - new Date(bv).getTime(); }
    return difference * sign || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
export function dateInput(value: string | null, timezone = workspaceTimezone) { return value ? localDate(value, timezone) : ''; }
export function scheduleValue(value: string, timezone = workspaceTimezone) { return scheduledInstant(value, timezone); }
export type Draft = { trade?: string; title: string; description: string; client_id: string; site_id: string; priority: string; assignee_id: string; scheduled_for: string; due_on: string };
export function draftErrors(draft: Draft) { const errors: Record<string, string> = {}; if (!draft.title.trim()) errors.title = 'Enter a title.'; else if (draft.title.trim().length > 200) errors.title = 'Use 200 characters or fewer.'; if (draft.description.length > 20000) errors.description = 'Use 20,000 characters or fewer.'; if (!draft.client_id) errors.client_id = 'Choose a client.'; if (!draft.site_id) errors.site_id = 'Choose a site.'; return errors; }

export const clientStatusHints:Record<string,string> = {waiting_on_parts:"We've ordered what's needed."};
export const clientStatusLabels:Record<string,string> = {open:'Request Received',scheduled:'Visit Scheduled',in_progress:'Work in Progress',waiting_on_parts:'Waiting on Parts',done:'Completed',cancelled:'Cancelled'};
export function visibleComments(comments:Comment[],client:boolean) { return client ? comments.filter(c=>c.visibility==='client') : comments; }
export function clientEvent(event:Detail['timeline'][number],timezone=workspaceTimezone) {
 const details=event.details;
 const status=details?.to_status??event.to_status;
 if(status)return clientStatusLabels[status]??'Request updated';
 if(event.kind==='created')return 'Request received';
 if(event.kind==='schedule_changed')return details?.scheduled_for?`Visit scheduled for ${formatDate(details.scheduled_for,timezone)}`:'Visit schedule cleared';
 if(event.kind==='due_changed')return details?.due_on?`Due date set to ${formatDate(details.due_on,timezone)}`:'Due date cleared';
 if(event.kind==='assignment_changed')return details?.assignee_name?`Assigned to ${details.assignee_name}`:'Assignment cleared';
 if(event.kind==='details_changed')return [details?.title_changed?'Title updated':'',details?.description_changed?'Description updated':'',details?.priority?`Priority changed to ${label(details.priority)}`:''].filter(Boolean).join('. ')||'Request details updated';
 if(event.kind==='supplier_repaired')return 'Parts update received';
 return 'Request updated';
}
export function staffEvent(event:Detail['timeline'][number],timezone=workspaceTimezone) {
 const title=event.work_order_title,status=event.details?.to_status??event.to_status;
 if(status)return title?`moved ${title}${event.details?.from_status?` from ${statusLabels[event.details.from_status]??label(event.details.from_status)}`:''} to ${statusLabels[status]??label(status)}`:`moved to ${statusLabels[status]??label(status)}`;
 if(event.kind==='created')return title?`created ${title}`:'created the job';
 if(event.kind==='schedule_changed')return (event.details?.scheduled_for?`scheduled${title?` ${title}`:''} for ${formatDate(event.details.scheduled_for,timezone)}`:`cleared the visit schedule${title?` on ${title}`:''}`);
 if(event.kind==='assignment_changed')return (event.details?.assignee_name?`assigned ${event.details.assignee_name}${title?` to ${title}`:''}`:`cleared the assignment${title?` on ${title}`:''}`);
 return clientEvent(event,timezone).replace(/^./,s=>s.toLowerCase())+(title?` on ${title}`:'');
}
export function transitionOptions(current:string) {
 return Object.entries(statusLabels).map(([value,title])=>({value,label:value===current?`${title} (current status)`:statusTransitions[current]?.includes(value)?title:`${title}: ${current==='open'?'Move to Scheduled first':current==='scheduled'?'Move to In Progress first':'Unavailable from this status'}`,disabled:value===current||!statusTransitions[current]?.includes(value)}));
}
export function providerOnlyPath(path:string) { return /^\/(dashboard|imports?|queue|supplier|clients|audit|team|today|schedule|documents)(\/|$)/.test(path)||/^\/work-orders\/[^/]+\/edit$/.test(path); }
/** Technicians use only their jobs and Settings: every office page, plus creating work orders, is closed to them. */
export function officeOnlyPath(path:string) { return (providerOnlyPath(path)&&!/^\/today(\/|$)/.test(path))||path==='/work-orders/new'||/^\/(isolation)(\/|$)/.test(path); }

// Older demo titles repeated the site and sequence after an em dash.
// Only remove that exact metadata suffix; preserve user-entered titles.
export function workOrderTitle(order: Pick<WorkOrder,'title'|'site_name'|'order_number'>) {
 const suffix = order.site_name ? ` — ${order.site_name} / ${order.order_number}` : '';
 return suffix && order.title.endsWith(suffix) ? order.title.slice(0,-suffix.length) : order.title;
}

/** Technicians open on the jobs they still have to do; done and cancelled stay one filter away. */
export function activeByDefault(api: URLSearchParams, role: string | null | undefined) { if (role === 'technician' && !api.has('status') && !api.has('overdue') && !api.has('active') && !api.has('today')) for (const st of ['open', 'scheduled', 'in_progress', 'waiting_on_parts']) api.append('status', st); return api; }
