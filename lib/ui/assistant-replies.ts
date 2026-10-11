import { formatDate } from '../dates';
import { readableLabel } from './polish';
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Remove storage identifiers and translate machine words at the final reply boundary. */
export function plainAssistantReply(value: string) {
  const links: string[] = [];
  let text = value.replace(/\]\(\/work-orders\/[0-9a-f-]{36}\)/gi, link => { links.push(link);return `LINKPLACEHOLDER${links.length-1}END`; });
  text = text.replace(/\b(?:site|client|workspace|user|work order|row)\s+ID\s*[:=]?\s*/gi, '')
    .replace(uuid, 'the linked record').replace(/\b[0-9a-f]{32,64}\b/gi,'the linked record').replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{0,4})?(?:…|\.{3})/gi,'the linked record')
    .replace(/\b(in_progress|waiting_on_parts|client_visible|internal_note|pending_approval|read_only|cancelled|scheduled|open|done|urgent|normal|high|low|admin|staff|client)\b/gi, word => readableLabel(word.toLowerCase()))
    .replace(/\b(?:[a-z]+_)+(?:id|at|for|on)\b/g, word => readableLabel(word))
    .replace(/\b(?:list|get|update|create|add|approve|reject|set)_(?:[a-z]+_)*[a-z]+\b/g,'the workspace action')
    .replace(/there (?:is|are) no available tool[s]? to (?:modify|change) priority/gi,"I can’t change priority here. Open the work order and use Edit.")
    .replace(/\btool(?:s)?\b/gi,'workspace action')
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/gi, word=>readableLabel(word.toLowerCase()))
    .replace(/\b[0-9a-f]{8}\b/gi,'the linked record')
    .replace(/LINKPLACEHOLDER(\d+)END/g,(_,index) => links[Number(index)]);
  return text;
}
type Order = {id:string;order_number:number;title:string;status:string;priority:string;timezone?:string;due_on?:string|null;scheduled_for?:string|null};
export function assistantTarget(order: Order) { return `WO-${order.order_number} ${plainAssistantReply(order.title)}`; }
export function actionSummary(tool: string, args: Record<string,any>, order?: Order | null, target?: string, timezone?:string) {
  const name = order ? assistantTarget(order) : plainAssistantReply(target ?? 'the selected row');
  if(tool==='add_comment')return `Add ${args.visibility==='internal'?'an internal note (team only)':'a comment visible to the client'} to ${name}:\n\n${plainAssistantReply(args.body)}`;
  if(tool==='update_work_order_status')return `Move ${name}: ${readableLabel(order!.status)} → ${readableLabel(args.status)}`;
  if(tool==='set_priority')return `Change priority for ${name}: ${readableLabel(order!.priority)} → ${readableLabel(args.priority)}`;
  if(tool==='update_work_order_dates')return `Change dates for ${name}:\n${['due_on','scheduled_for'].filter(key=>key in args).map(key=>`${key==='due_on'?'Due date':'Visit'}: ${order?.[key as 'due_on'|'scheduled_for']?formatDate(order[key as 'due_on'|'scheduled_for']!,order.timezone):'None'} → ${args[key]?formatDate(args[key],order?.timezone):'None'}`).join('\n')}`;
  if(tool==='create_request')return `Create request “${plainAssistantReply(args.title)}” at ${plainAssistantReply(target??'the selected site')}\nPriority: ${readableLabel(args.priority??'normal')}${args.description?`\n\n${plainAssistantReply(args.description)}`:''}${args.due_on?`\nDue: ${formatDate(args.due_on,timezone)}`:''}${args.scheduled_for?`\nVisit: ${formatDate(args.scheduled_for,timezone)}`:''}`;
  if(tool==='approve_queue_row')return `Approve ${name}${args.edits?` with these corrections:\n${Object.entries(args.edits).map(([k,v])=>`${readableLabel(k)}: ${plainAssistantReply(String(v))}`).join('\n')}` : ''}`;
  return `Reject ${name}:\n\n${plainAssistantReply(args.reason??'')}`;
}
export function actionResult(tool: string, args: Record<string,any>, order?: Order | null, target?: string) {
  if(!order)return plainAssistantReply(tool==='reject_queue_row'?`Rejected ${target??'the selected row'}: ${args.reason}`:`Updated ${target??'the selected row'}.`);
  const name=assistantTarget(order).replace(/[\[\]\r\n]/g,' '),link=`[${name}](/work-orders/${order.id})`;
  if(tool==='update_work_order_status')return `Moved ${link} to ${readableLabel(args.status)}.`;
  if(tool==='set_priority')return `Changed priority for ${link} to ${readableLabel(args.priority)}.`;
  if(tool==='add_comment')return `Added ${args.visibility==='internal'?'an internal note':'a comment visible to the client'} to ${link}.\n\n${plainAssistantReply(args.body)}`;
  if(tool==='update_work_order_dates')return `Updated dates for ${link}.\n${actionSummary(tool,args,order).split('\n').slice(1).join('\n')}`;
  return `Created ${link}.`;
}
