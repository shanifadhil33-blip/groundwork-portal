import { formatDate } from '../dates';
import { statusLabels } from './work-orders';
export const plural = (count:number, singular:string, multiple=`${singular}s`) => `${count} ${count===1?singular:multiple}`;
export const readableLabel = (value:string) => statusLabels[value] ?? value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function demoEmail(value:string|null|undefined) { return value?.replace(/^([a-z]+)\.[0-9a-f-]+@demo\.groundwork\.invalid$/i,'$1@ridgeline.demo')??''; }
export const supplierReference = (value:string) => value.replace(/^[0-9a-f-]+:/i,'');
export const entityLabels:Record<string,string>={work_orders:'Work order',work_order_events:'Work order activity',comments:'Comment',clients:'Client',sites:'Site',members:'Team member',imports:'Import',import_rows:'Import row',supplier_orders:'Supplier order',supplier_events:'Supplier delivery update',api_tokens:'Agent key',tokens:'Agent key',supplier_sync_runs:'Supplier update',invites:'Invite',workspaces:'Workspace',notifications:'Notification'};
type Activity={actor?:{name?:string|null}|null;actor_name?:string|null;entity:string;action:string;before?:unknown;after?:unknown;work_order_title?:string|null;member_name?:string|null};
function record(value:unknown):Record<string,unknown> { return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}; }
export function activitySentence(item:Activity, timezone='Asia/Dubai') {
 const before=record(item.before),after=record(item.after),actor=item.actor?.name??item.actor_name??'System',title=item.work_order_title??after.title??before.title;
 const verb=item.action==='insert'?'created':item.action==='delete'?'deleted':'updated';
 const subject=item.entity==='work_orders'?String(title??'a work order'):item.entity==='comments'?`a comment${title?` on ${title}`:''}`:(entityLabels[item.entity]??'Record').toLowerCase();
 if(item.entity==='members'){const name=item.member_name??after.name??before.name??'a team member',role=String(after.role??before.role??'member');return item.action==='insert'?`${actor} added ${name} as ${readableLabel(role)}`:item.action==='delete'?`${actor} removed ${name} from the team`:`${actor} changed ${name}’s role to ${readableLabel(role)}`;}
 if(item.entity==='api_tokens'||item.entity==='tokens')return `${actor} ${after.revoked_at&&!before.revoked_at?'revoked':after.last_used_at!==before.last_used_at&&after.last_used_at?'used':verb} agent key '${after.name??before.name??'Unnamed key'}'`;
 if(item.entity==='comments')return `${actor} ${verb} ${after.visibility==='internal'||before.visibility==='internal'?'an internal note':'a comment visible to the client'}${title?` on ${title}`:''}`;
 if(item.entity==='supplier_sync_runs')return `${actor} ${after.operation==='repair'?'repaired supplier updates':'checked for missed supplier updates'} (${after.trigger==='cron'?'automatic':'manual'}) · ${after.status==='error'?'Failed':`${plural(Number(after.mismatches_found??0),'mismatch','mismatches')}, ${Number(after.repaired_count??0)} repaired`}`;
 if(item.entity==='imports')return `${actor} ${verb} import '${after.filename??before.filename??'spreadsheet'}'${after.status&&after.status!==before.status?` · ${readableLabel(String(after.status))}`:''}`;
 if(item.entity==='import_rows')return `${actor} ${after.decision==='approved'?'approved':after.decision==='rejected'?'rejected':'reopened'} row ${after.row_number??before.row_number} of ${after.filename??before.filename??'the spreadsheet'}${after.work_order_number?` → WO-${after.work_order_number}`:''}`;
 if(item.entity==='invites')return `${actor} ${after.status==='revoked'?'revoked':after.status==='accepted'?'accepted':verb} invite for ${demoEmail(String(after.email??before.email??'a team member'))}`;
 if(item.entity==='supplier_orders'||item.entity==='supplier_events')return `${actor} ${verb} supplier ${item.entity==='supplier_orders'?'order':'update'} ${supplierReference(String(after.cobalt_ref??before.cobalt_ref??''))}${title?` for ${title}`:''}${after.local_status||after.status?` · ${readableLabel(String(after.local_status??after.status))}`:''}`;
 if(['clients','sites','workspaces'].includes(item.entity))return `${actor} ${verb} ${subject}${after.name||before.name?` '${after.name??before.name}'`:''}`;
 if(item.entity==='work_orders'&&item.action==='update'&&before.status!==after.status&&after.status)return before.status?`${actor} moved ${subject} from ${readableLabel(String(before.status))} to ${readableLabel(String(after.status))}`:`${actor} changed ${subject} status to ${readableLabel(String(after.status))}`;
 if(item.entity==='work_orders'&&item.action==='update') {
  const changes:string[]=[];
  if(before.assignee_id!==after.assignee_id)changes.push(after.assignee_name?`assigned ${after.assignee_name}`:after.assignee_id?'changed the assignment':'cleared the assignment');
  if(before.scheduled_for!==after.scheduled_for)changes.push(after.scheduled_for?`scheduled for ${formatDate(String(after.scheduled_for),timezone)}`:'cleared the visit schedule');
  if(before.due_on!==after.due_on)changes.push(after.due_on?`set the due date to ${formatDate(String(after.due_on),timezone)}`:'cleared the due date');
  if(changes.length)return `${actor} ${changes.join(' and ')} on ${subject}`;
 }
 if(item.entity==='work_order_events') {
  const details=record(after.details),status=details.to_status??after.to_status;
  const change=status?`moved ${title??'a work order'} to ${readableLabel(String(status))}`:after.kind==='schedule_changed'?(details.scheduled_for?`scheduled ${title??'a work order'} for ${formatDate(String(details.scheduled_for),timezone)}`:'cleared the visit schedule'):after.kind==='assignment_changed'?(details.assignee_name?`assigned ${details.assignee_name} to ${title??'a work order'}`:'cleared the assignment'):after.kind==='due_changed'?(details.due_on?`set the due date to ${formatDate(String(details.due_on),timezone)}`:'cleared the due date'):after.kind==='created'?`created ${title??'a work order'}`:`updated request details for ${title??'a work order'}`;
  return `${actor} ${change}`;
 }
 return `${actor} ${item.action==='insert'?'created':item.action==='delete'?'deleted':'updated'} ${subject}`;
}
const fieldLabels:Record<string,string>={created_at:'Created',occurred_at:'Occurred',started_at:'Started',finished_at:'Finished',revoked_at:'Revoked',rejected_at:'Rejected',title:'Title',description:'Description',status:'Status',priority:'Priority',due_on:'Due date',scheduled_for:'Scheduled date',name:'Name',body:'Comment',visibility:'Visibility',local_status:'Portal status',cobalt_ref:'Supplier reference',role:'Role',email:'Email',decision:'Decision',reason:'Reason',filename:'Filename',row_count:'Row count',scope:'Scope',expires_at:'Expiry',assignee_name:'Assignee',client:'Client',site:'Site',external_ref:'External reference',address:'Address',timezone:'Timezone',from_status:'Previous status',to_status:'New status'};
function fieldValue(value:unknown,key:string,timezone='Asia/Dubai') {
 if(value===null||value===undefined||value==='')return 'Not set';
 if(typeof value==='object')return 'Updated values';
 const text=String(value);if(key==='visibility')return text==='internal'?'Internal note':'Visible to the client';if(key==='email')return demoEmail(text);if(key==='cobalt_ref')return supplierReference(text);if(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text))return 'Linked record';

 if(key==='due_on'||(/^\d{4}-\d{2}-\d{2}$/.test(text)&&key.endsWith('_for')))return formatDate(text,timezone);
 if(key.endsWith('_at')||key==='scheduled_for')return Number.isNaN(Date.parse(text))?'Not set':new Intl.DateTimeFormat('en',{timeZone:timezone,dateStyle:'medium',timeStyle:'short'}).format(new Date(text));
 return ['status','from_status','to_status','priority','visibility','local_status','role','decision','scope'].includes(key)?readableLabel(text):text;
}
export function auditDiff(beforeValue:unknown,afterValue:unknown,timezone='Asia/Dubai') {
 const originalBefore=record(beforeValue),originalAfter=record(afterValue),before={...record(originalBefore.data),...originalBefore},after={...record(originalAfter.data),...originalAfter};
 return Object.keys(fieldLabels).filter(key=>(key in before||key in after)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({field:fieldLabels[key],old:fieldValue(before[key],key,timezone),new:fieldValue(after[key],key,timezone)})).filter(diff=>diff.old!==diff.new);
}
