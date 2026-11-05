import { plainJobWording } from './job-wording';
import { notificationTemplates, type NotificationTemplate } from './notifications';
import { rolesLabel } from '../roles';
import { entityLabels, readableLabel, supplierReference } from './polish';

export const auditTemplates = {
  changed: '{name} updated {job}.',
  created: '{name} created {job}.',
  deleted: '{name} deleted {job}.',
  member: '{name} changed {person}’s role to {role}',
  added: '{name} added {person} as {role}',
  removed: '{name} removed {person} from the team',
  record: '{name} {action} {entity} ‘{record}’',
  supplier: '{name} {action} supplier order {reference} for {job} · {status}',
  assigned: '{name} assigned {person} on {job}',
  unassigned: '{name} cleared the assignment on {job}',
  scheduled: '{name} scheduled {job} for {date}',
  unscheduled: '{name} cleared the visit schedule on {job}',
  due: '{name} set the due date for {job} to {date}',
  noDue: '{name} cleared the due date on {job}',
  status: '{name} changed {job} status to {status}',
} as const;
type AuditSource = { actor_name?: string | null; actor?: {name?: string | null} | null; member_name?: string | null; entity: string; action: string; before?: unknown; after?: unknown; work_order_title?: string | null };
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
/** Use stored fields, never a sentence containing user names as a dictionary key. */
export function auditSummaryTemplates(item: AuditSource): NotificationTemplate[] | null {
  const before = record(item.before), after = record(item.after);
  const name = item.actor?.name ?? item.actor_name ?? 'System';
  const job = String(item.work_order_title ?? after.title ?? before.title ?? 'Job');
  const values = { name, job, action: item.action === 'insert' ? 'Created' : item.action === 'delete' ? 'Deleted' : 'Updated' };
  const make = (key: string, extra: Record<string,string> = {}, translated: string[] = []): NotificationTemplate => ({key, values: {...values, ...extra}, translatedValues: ['action', ...(name === 'System' ? ['name'] : []), ...translated]});
  if (item.entity === 'members') return [make(item.action === 'insert' ? auditTemplates.added : item.action === 'delete' ? auditTemplates.removed : auditTemplates.member, {person: String(item.member_name ?? after.name ?? before.name ?? 'Team member'), role: rolesLabel({...before,...after,role: String(after.role ?? before.role ?? 'member')})}, ['role'])];
  if (['clients','sites','workspaces'].includes(item.entity)) return [make(auditTemplates.record, {entity: entityLabels[item.entity], record: String(after.name ?? before.name ?? '')}, ['entity'])];
  if (item.entity === 'supplier_orders') return [make(auditTemplates.supplier, {reference: supplierReference(String(after.cobalt_ref ?? before.cobalt_ref ?? '')), status: readableLabel(String(after.local_status ?? after.status ?? 'Ordered'))}, ['status'])];
  if (item.entity === 'imports') {
    const key = item.action === 'insert' ? '{name} created {type}: {item}.' : item.action === 'delete' ? '{name} deleted {type}: {item}.' : '{name} updated {type}: {item}.';
    const messages = [make(key, {type: 'Import', item: String(after.filename ?? before.filename ?? '')}, ['type'])];
    if (after.status && after.status !== before.status) messages.push({key: '{status}', values: {status: readableLabel(String(after.status))}, translatedValues: ['status']});
    return messages;
  }
  if (item.entity === 'comments') {
    const visibility = after.visibility ?? before.visibility;
    if (item.action === 'insert') return [make(visibility === 'internal' ? notificationTemplates.internal : notificationTemplates.comment)];
    return [make(item.action === 'delete' ? '{name} deleted {type}: {item}.' : '{name} updated {type}: {item}.', {type: 'Comment', item: job}, ['type']), {key: '{visibility}', values: {visibility: visibility === 'internal' ? 'Internal note' : 'Visible to the client'}, translatedValues: ['visibility']}];
  }
  if (item.entity === 'supplier_events') {
    const key = item.action === 'insert' ? '{name} created {type}: {item}.' : item.action === 'delete' ? '{name} deleted {type}: {item}.' : '{name} updated {type}: {item}.';
    return [make(key, {type: entityLabels.supplier_events, item: supplierReference(String(after.cobalt_ref ?? before.cobalt_ref ?? ''))}, ['type']), {key: '{status}', values: {status: readableLabel(String(after.local_status ?? after.status ?? 'Ordered'))}, translatedValues: ['status']}];
  }
  if (item.entity !== 'work_orders') return null;
  if (item.action !== 'update') return [make(item.action === 'insert' ? auditTemplates.created : auditTemplates.deleted)];
  if (before.status !== after.status && after.status) return [make(auditTemplates.status, {status: readableLabel(after.status)}, ['status'])];
  const messages: NotificationTemplate[] = [];
  if (before.assignee_id !== after.assignee_id) messages.push(make(after.assignee_id ? auditTemplates.assigned : auditTemplates.unassigned, {person: after.assignee_name ?? 'Team member'}));
  // Dates are rendered per viewer; the API carries raw ISO values, never English date strings.
  for (const [field, yes, no] of [['scheduled_for',auditTemplates.scheduled,auditTemplates.unscheduled],['due_on',auditTemplates.due,auditTemplates.noDue]] as const) {
    if (before[field] !== after[field]) messages.push(after[field] ? {...make(yes), values: {...values, date: String(after[field])}, dateValues: {date: String(after[field])}} : make(no));
  }
  return messages.length ? messages : [make(auditTemplates.changed)];
}

export const agentPriorityTemplate = 'Change priority for {job}: {from} to {to}';
/** Legacy decision logs use this exact system shape; freeform replies remain authored text. */
export function agentSummaryTemplate(source: string): NotificationTemplate | null {
  const match = /^Change priority for (.+): (low|normal|high|urgent|Low|Normal|High|Urgent) (?:to|→) (low|normal|high|urgent|Low|Normal|High|Urgent)$/.exec(source);
  return match ? {key: agentPriorityTemplate, values: {job: plainJobWording(match[1], 'en'), from: readableLabel(match[2]), to: readableLabel(match[3])}, translatedValues: ['from','to']} : null;
}
