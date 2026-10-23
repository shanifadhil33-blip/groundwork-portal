import { formatDate } from '../dates';
import { notificationTemplates, priceChangeEventTemplate, type NotificationTemplate } from './notifications';
import { clientStatusLabels, label, statusLabels, type Comment, type Detail } from './work-orders';

/** Saved event bodies are legacy English copy. Render system sentences from static templates. */
export const historyTemplates = {
 assigned: '{name} assigned {assignee} to {job}.',
 unassigned: '{name} cleared the assignment on {job}.',
 scheduled: '{name} scheduled {job} for {time}.',
 unscheduled: '{name} cleared the visit schedule on {job}.',
 due: '{name} set the due date for {job} to {time}.',
 no_due: '{name} cleared the due date on {job}.',
 title: '{name} updated the title on {job}.',
 description: '{name} updated the description on {job}.',
 priority: '{name} changed the priority of {job} to {priority}.',
 parts: '{name} received a parts update on {job}.',
 checklist: '{name} saved the checklist and materials for {job}.',
 assistant: 'via assistant',
 agent: 'via AI agent: {key}',
} as const;

export function historyActor(name: string): NotificationTemplate {
 return {key:'{name}',values:{name},translatedValues:['System','Your team'].includes(name)?['name']:[]};
}

export function historyEventTemplates(event: Detail['timeline'][number], actor: string, title: string, client=false, timezone='Asia/Dubai', language='en-IN'): NotificationTemplate[] {
 const job=event.work_order_title??title;
 const values={name:actor,job};
 const make=(key:string,extra:Record<string,string>={},translated:string[]=[]):NotificationTemplate=>({key,values:{...values,...extra},translatedValues:[...(historyActor(actor).translatedValues??[]),...translated]});
 // Preserve client visit/photo notices supplied by the service. Generic updates
 // get the same specific, translated history as the other roles below.
 if(client&&event.message_template&&event.message_template.key!==notificationTemplates.client_update)return [event.message_template];
 const price=priceChangeEventTemplate(event,actor,title);
 if(price)return [{...price,translatedValues:[...(price.translatedValues??[]),...(historyActor(actor).translatedValues??[])]}];
 const details=event.details;
 const to=details?.to_status??event.to_status,from=details?.from_status??event.from_status;
 const statuses=client?clientStatusLabels:statusLabels;
 if(to)return [make(from?notificationTemplates.moved:notificationTemplates.moved_to,{...(from?{from:statuses[from]??label(from)}:{}),to:statuses[to]??label(to)},['from','to'])];
 if(event.kind==='status_changed')return [make(notificationTemplates.status)];
 if(event.kind==='created')return [make(notificationTemplates.created)];
 if(event.kind==='on_the_way')return [make(notificationTemplates.on_way)];
 if(event.kind==='assignment_changed')return [details?.assignee_name?make(historyTemplates.assigned,{assignee:details.assignee_name}):make(historyTemplates.unassigned)];
 if(event.kind==='schedule_changed')return [details?.scheduled_for?make(historyTemplates.scheduled,{time:formatDate(details.scheduled_for,timezone,false,language)}):make(historyTemplates.unscheduled)];
 if(event.kind==='due_changed')return [details?.due_on?make(historyTemplates.due,{time:formatDate(details.due_on,timezone,false,language)}):make(historyTemplates.no_due)];
 if(event.kind==='details_changed'){
  const messages:NotificationTemplate[]=[];
  if(details?.title_changed)messages.push(make(historyTemplates.title));
  if(details?.description_changed)messages.push(make(historyTemplates.description));
  if(details?.priority)messages.push(make(historyTemplates.priority,{priority:label(details.priority)},['priority']));
  return messages.length?messages:[make(notificationTemplates.updated)];
 }
 if(event.kind==='supplier_repaired')return [make(historyTemplates.parts)];
 if(event.kind==='job_checklist')return [make(historyTemplates.checklist)];
 if(event.kind==='quote_sent')return [make(notificationTemplates.quote)];
 return [make(notificationTemplates.updated)];
}

export function historyCommentTemplate(comment: Comment, actor: string, title: string): NotificationTemplate {
 return {key:comment.visibility==='internal'?notificationTemplates.internal:notificationTemplates.comment,values:{name:actor,job:comment.work_order_title??title},translatedValues:historyActor(actor).translatedValues};
}
export function historyAttribution(item:{actor_kind?:string;via_token_name?:string|null}):NotificationTemplate|null {
 if(item.actor_kind==='assistant')return {key:historyTemplates.assistant,values:{}};
 if(item.actor_kind==='agent')return {key:historyTemplates.agent,values:{key:item.via_token_name||'Unnamed key'},translatedValues:item.via_token_name?[]:['key']};
 return null;
}
