export const plural = (count:number, singular:string, multiple=`${singular}s`) => `${count} ${count===1?singular:multiple}`;
export const readableLabel = (value:string) => value.replaceAll('_',' ').replace(/^./,c=>c.toUpperCase());
export function demoEmail(value:string|null|undefined) { return value?.replace(/^([a-z]+)\.[0-9a-f-]+@demo\.groundwork\.invalid$/i,'$1@ridgeline.demo')??''; }
export const supplierReference = (value:string) => value.replace(/^[0-9a-f-]+:/i,'');
export const entityLabels:Record<string,string>={work_orders:'Work order',work_order_events:'Work order activity',comments:'Comment',clients:'Client',sites:'Site',members:'Team member',imports:'Import',import_rows:'Import row',supplier_orders:'Supplier order',supplier_events:'Supplier update',tokens:'API key',invites:'Invite',workspaces:'Workspace',notifications:'Notification'};
type Activity={actor?:{name?:string|null}|null;actor_name?:string|null;entity:string;action:string;before?:unknown;after?:unknown;work_order_title?:string|null};
function record(value:unknown):Record<string,unknown> { return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}; }
export function activitySentence(item:Activity) {
 const before=record(item.before),after=record(item.after),actor=item.actor?.name??item.actor_name??'System',title=item.work_order_title??after.title??before.title;
 const subject=item.entity==='work_orders'?String(title??'a work order'):item.entity==='comments'?`a comment${title?` on ${title}`:''}`:(entityLabels[item.entity]??'Record').toLowerCase();
 if(item.entity==='work_orders'&&item.action==='update'&&before.status!==after.status&&after.status)return `${actor} changed ${subject} status to ${readableLabel(String(after.status))}`;
 if(item.entity==='work_order_events')return `${actor} ${after.to_status?`moved ${title??'a work order'} to ${readableLabel(String(after.to_status))}`:`recorded activity for ${title??'a work order'}`}`;
 return `${actor} ${item.action==='insert'?'created':item.action==='delete'?'deleted':'updated'} ${subject}`;
}
const fieldLabels:Record<string,string>={title:'Title',description:'Description',status:'Status',priority:'Priority',scheduled_for:'Scheduled date',name:'Name',body:'Comment',visibility:'Visibility',local_status:'Portal status',cobalt_ref:'Supplier reference',role:'Role',email:'Email',decision:'Decision',reason:'Reason',filename:'Filename',row_count:'Row count',scope:'Scope',expires_at:'Expiry',assignee_name:'Assignee',client:'Client',site:'Site',external_ref:'External reference',address:'Address',timezone:'Timezone',from_status:'Previous status',to_status:'New status'};
function fieldValue(value:unknown,key:string) {
 if(value===null||value===undefined||value==='')return '—';
 if(typeof value==='object')return 'Updated values';
 const text=String(value);if(key==='email')return demoEmail(text);if(key==='cobalt_ref')return supplierReference(text);if(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text))return 'Linked record';

 if(key==='scheduled_for'||key==='expires_at')return Number.isNaN(Date.parse(text))?'—':new Date(text).toLocaleString();
 return ['status','from_status','to_status','priority','visibility','local_status','role','decision','scope'].includes(key)?readableLabel(text):text;
}
export function auditDiff(beforeValue:unknown,afterValue:unknown) {
 const originalBefore=record(beforeValue),originalAfter=record(afterValue),before={...record(originalBefore.data),...originalBefore},after={...record(originalAfter.data),...originalAfter};
 return Object.keys(fieldLabels).filter(key=>(key in before||key in after)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({field:fieldLabels[key],old:fieldValue(before[key],key),new:fieldValue(after[key],key)}));
}
