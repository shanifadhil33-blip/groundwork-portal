import { formatDate } from '../dates';
import { readableLabel } from './polish';
import { clientStatusLabels, statusLabels } from './work-orders';
import { countryName, formatPhone, regionField } from '../countries/rules';

export function audienceStatusReply(value:string, client=false) {
 const labels=client?clientStatusLabels:statusLabels;
 const names=Object.keys(statusLabels).flatMap(status=>[status,statusLabels[status],clientStatusLabels[status]].map(name=>({name,status}))).sort((a,b)=>b.name.length-a.name.length);
 const escape=(name:string)=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`\\b(?:${names.map(({name})=>escape(name)).join('|')})(?=$|\\W)`,'gi');
 return value.replace(pattern,name=>labels[names.find(entry=>entry.name.toLowerCase()===name.toLowerCase())!.status]);
}
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Remove storage identifiers and translate machine words at the final reply boundary. */
export function plainAssistantReply(value: string, client=false) {
  const links: string[] = [];
  let text = value.replace(/\]\(\/work-orders\/[0-9a-f-]{36}\)/gi, link => { links.push(link);return `LINKPLACEHOLDER${links.length-1}END`; });
  text = text.replace(/\b(?:site|client|workspace|user|job|row)\s+ID\s*[:=]?\s*/gi, '')
    .replace(uuid, 'the linked record').replace(/\b[0-9a-f]{32,64}\b/gi,'the linked record').replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{0,4})?(?:…|\.{3})/gi,'the linked record')
    .replace(/\b(in_progress|waiting_on_parts|client_visible|internal_note|pending_approval|read_only|cancelled|scheduled|open|done|urgent|normal|high|low|admin|staff|client)\b/gi, word => statusLabels[word.toLowerCase()] ?? readableLabel(word.toLowerCase()))
    .replace(/\b(?:[a-z]+_)+(?:id|at|for|on)\b/g, word => readableLabel(word))
    .replace(/\b(?:list|get|update|create|add|approve|reject|set)_(?:[a-z]+_)*[a-z]+\b/g,'the workspace action')
    .replace(/there (?:is|are) no available tool[s]? to (?:modify|change) priority/gi,"I can’t change priority here. Open the job and use Edit.")
    .replace(/\btool(?:s)?\b/gi,'workspace action')
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/gi, word=>readableLabel(word.toLowerCase()))
    .replace(/\b[0-9a-f]{8}\b/gi,'the linked record')
    .replace(/LINKPLACEHOLDER(\d+)END/g,(_,index) => links[Number(index)]);
  return audienceStatusReply(text,client);
}
export const recordTools = ['create_client','update_client','create_site','update_site'];
const recordLabels: Record<string,string> = { name:'Name', contact_name:'Main contact', phone:'Phone', email:'Email', billing_building:'Building', billing_street:'Street', billing_area:'Area', billing_city:'City', notes:'Notes', address:'Address', building:'Building name or number', area:'Area', access_notes:'Access notes', contact_phone:'Site contact phone' };
type RecordTarget = { label: string; record?: Record<string,any> | null; country?: string };
/** Labels that depend on the record's country: its region level. */
function recordLabel(tool: string, key: string, country?: string) {
  if (tool.endsWith('site') && key === 'contact_name') return 'Site contact';
  if (key === 'billing_region' || key === 'region') return regionField(country).label;
  if (key === 'country') return 'Country';
  return recordLabels[key] ?? readableLabel(key);
}
function recordValue(key: string, value: unknown, country?: string) {
  if (key === 'country') return value ? countryName(String(value)) : 'Same as workspace';
  if (value === null || value === undefined || value === '') return 'None';
  if (key === 'phone' || key === 'contact_phone') return formatPhone(String(value));
  return plainAssistantReply(String(value));
}
function recordLines(tool: string, args: Record<string,any>, previous?: Record<string,any> | null, country?: string) {
  return Object.entries(args).filter(([key, value]) => !['id','client_id'].includes(key) && value !== undefined && !(tool.startsWith('create') && (key === 'name' || value === null)))
    .map(([key, value]) => `${recordLabel(tool, key, country)}: ${previous ? `${recordValue(key, previous[key], country)} → ` : ''}${recordValue(key, value, country)}`).join('\n');
}
/** Confirmation card text for client and site writes. target is the record (update) or the client name (create site). */
export function recordSummary(tool: string, args: Record<string,any>, target?: RecordTarget) {
  const lines = recordLines(tool, args, tool.startsWith('update') ? target?.record : null, target?.country);
  const name = plainAssistantReply(target?.label ?? 'the selected record');
  if (tool === 'create_client') return `Add client “${plainAssistantReply(args.name)}”${lines ? `\n${lines}` : ''}`;
  if (tool === 'create_site') return `Add site “${plainAssistantReply(args.name)}” for ${name}${lines ? `\n${lines}` : ''}`;
  return `Update ${tool === 'update_site' ? 'site' : 'client'} ${name}:\n${lines || 'No changes'}`;
}
export function recordResult(tool: string, args: Record<string,any>, target?: { label: string }) {
  const name = plainAssistantReply(target?.label ?? 'the selected record');
  if (tool === 'create_client') return `Added client ${plainAssistantReply(args.name)}.`;
  if (tool === 'create_site') return `Added site ${plainAssistantReply(args.name)} for ${name}.`;
  return `Updated ${tool === 'update_site' ? 'site' : 'client'} ${name}.`;
}
type Order = {id:string;order_number:number;title:string;status:string;priority:string;timezone?:string;due_on?:string|null;scheduled_for?:string|null};
export function assistantTarget(order: Order) { return `WO-${order.order_number} ${plainAssistantReply(order.title)}`; }
export function actionSummary(tool: string, args: Record<string,any>, order?: Order | null, target?: string, timezone?:string) {
  const name = order ? assistantTarget(order) : plainAssistantReply(target ?? 'the selected row');
  if(tool==='add_comment')return `Add ${args.visibility==='internal'?'an internal note (team only)':'a comment visible to the client'} to ${name}:\n\n${plainAssistantReply(args.body)}`;
  if(tool==='update_work_order_status')return `Move ${name}: ${statusLabels[order!.status] ?? readableLabel(order!.status)} → ${statusLabels[args.status] ?? readableLabel(args.status)}`;
  if(tool==='set_priority')return `Change priority for ${name}: ${readableLabel(order!.priority)} → ${readableLabel(args.priority)}`;
  if(tool==='update_work_order_dates')return `Change dates for ${name}:\n${['due_on','scheduled_for'].filter(key=>key in args).map(key=>`${key==='due_on'?'Due date':'Visit'}: ${order?.[key as 'due_on'|'scheduled_for']?formatDate(order[key as 'due_on'|'scheduled_for']!,order.timezone):'None'} → ${args[key]?formatDate(args[key],order?.timezone):'None'}`).join('\n')}`;
  if(tool==='create_request')return `Create request “${plainAssistantReply(args.title)}” at ${plainAssistantReply(target??'the selected site')}\nPriority: ${readableLabel(args.priority??'normal')}${args.description?`\n\n${plainAssistantReply(args.description)}`:''}${args.due_on?`\nDue: ${formatDate(args.due_on,timezone)}`:''}${args.scheduled_for?`\nVisit: ${formatDate(args.scheduled_for,timezone)}`:''}`;
  if(tool==='approve_queue_row')return `Approve ${name}${args.edits?` with these corrections:\n${Object.entries(args.edits).map(([k,v])=>`${readableLabel(k)}: ${plainAssistantReply(String(v))}`).join('\n')}` : ''}`;
  return `Reject ${name}:\n\n${plainAssistantReply(args.reason??'')}`;
}
export function actionResult(tool: string, args: Record<string,any>, order?: Order | null, target?: string) {
  if(!order)return plainAssistantReply(tool==='reject_queue_row'?`Rejected ${target??'the selected row'}: ${args.reason}`:`Updated ${target??'the selected row'}.`);
  const name=assistantTarget(order).replace(/[\[\]\r\n]/g,' '),link=`[${name}](/work-orders/${order.id})`;
  if(tool==='update_work_order_status')return `Moved ${link} to ${statusLabels[args.status] ?? readableLabel(args.status)}.`;
  if(tool==='set_priority')return `Changed priority for ${link} to ${readableLabel(args.priority)}.`;
  if(tool==='add_comment')return `Added ${args.visibility==='internal'?'an internal note':'a comment visible to the client'} to ${link}.\n\n${plainAssistantReply(args.body)}`;
  if(tool==='update_work_order_dates')return `Updated dates for ${link}.\n${actionSummary(tool,args,order).split('\n').slice(1).join('\n')}`;
  return `Created ${link}.`;
}
