export const statusLabels: Record<string, string> = { open: 'Open', scheduled: 'Scheduled', in_progress: 'In progress', waiting_on_parts: 'Waiting on parts', done: 'Done', cancelled: 'Cancelled' };
export const statusTransitions: Record<string, string[]> = { open: ['scheduled', 'cancelled'], scheduled: ['in_progress', 'cancelled'], in_progress: ['waiting_on_parts', 'done', 'cancelled'], waiting_on_parts: ['in_progress', 'done', 'cancelled'], done: [], cancelled: [] };
export const priorities = ['low', 'normal', 'high', 'urgent'];
export const label = (value: string) => value.charAt(0).toUpperCase() + value.slice(1).replaceAll('_', ' ');
export type Client = { id: string; name: string };
export type Site = { id: string; client_id: string; name: string; address: string };
export type Member = { user_id: string; role: string; client_id: string | null; name: string | null; email: string | null };
export type Comment = { id: string; body: string; visibility: 'client' | 'internal'; author_id: string; created_at: string };
export type WorkOrder = { id: string; title: string; description: string; client_id: string; site_id: string; status: string; priority: string; assignee_id: string | null; scheduled_for: string | null; updated_at: string; created_at: string };
export type Detail = WorkOrder & { client: Client; site: Site; assignee: { id: string; name?: string } | null; comments: Comment[]; timeline: { id: string; kind: string; actor_id: string | null; body?: string; from_status?: string; to_status?: string; created_at: string }[] };
export type Page<T> = { data: T[]; total: number; page: number; pageSize: number };
export function isOverdue(order: WorkOrder, now: number) { return !!order.scheduled_for && new Date(order.scheduled_for).getTime() < now && !['done', 'cancelled'].includes(order.status); }
export function sortOrders(orders: WorkOrder[], sort: string, dir: string) {
  const sign = dir === 'asc' ? 1 : -1;
  return [...orders].sort((a, b) => {
    let difference = 0;
    if (sort === 'priority') difference = priorities.indexOf(a.priority) - priorities.indexOf(b.priority);
    else if (sort === 'title') difference = a.title.localeCompare(b.title);
    else { const av = a[sort as 'updated_at' | 'created_at' | 'scheduled_for'], bv = b[sort as 'updated_at' | 'created_at' | 'scheduled_for']; if (!av || !bv) { if (av !== bv) return av ? -1 : 1; } else difference = new Date(av).getTime() - new Date(bv).getTime(); }
    return difference * sign || a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  });
}
export function dateInput(value: string | null) { if (!value) return ''; const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`; }
export function scheduleValue(value: string) { return value ? new Date(`${value}T09:00:00`).toISOString() : null; }
export type Draft = { title: string; description: string; client_id: string; site_id: string; priority: string; assignee_id: string; scheduled_for: string };
export function draftErrors(draft: Draft) { const errors: Record<string, string> = {}; if (!draft.title.trim()) errors.title = 'Enter a title.'; else if (draft.title.trim().length > 200) errors.title = 'Use 200 characters or fewer.'; if (draft.description.length > 20000) errors.description = 'Use 20,000 characters or fewer.'; if (!draft.client_id) errors.client_id = 'Choose a client.'; if (!draft.site_id) errors.site_id = 'Choose a site.'; return errors; }

export const clientStatusLabels:Record<string,string> = {open:'Request received',scheduled:'Visit scheduled',in_progress:'Work in progress',waiting_on_parts:"Waiting on parts — we've ordered what's needed",done:'Completed',cancelled:'Cancelled'};
export function visibleComments(comments:Comment[],client:boolean) { return client ? comments.filter(c=>c.visibility==='client') : comments; }
export function clientEvent(event:Detail['timeline'][number]) {
 if(event.to_status)return clientStatusLabels[event.to_status]??'Request updated';
 if(event.kind==='created')return 'Request received';
 if(event.kind==='supplier_repaired')return 'Parts update received';
 return 'Request updated';
}
export function providerOnlyPath(path:string) { return /^\/(dashboard|imports?|queue|supplier|clients|audit)(\/|$)/.test(path)||/^\/work-orders\/[^/]+\/edit$/.test(path); }
