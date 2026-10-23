import { formatInLang, uiLang } from '../date-lang';
import { savedReturnNotice } from '../status-updates';
import { label, clientStatusLabels, statusLabels, type Detail } from './work-orders';
type WorkNotification = {id:string;read_at:string|null;link_target:{entity:string;id:string}|null};
// Navigation waits for the read receipt so the bell stays in sync with the opened item.
export async function openNotificationTarget(item:WorkNotification,markRead:(id:string)=>Promise<unknown>,navigate:(id:string)=>void) {
 if(!item.link_target||!['work_order','work_orders','job_suggestions','time_off','members','conversations','team_space','join_requests','documents'].includes(item.link_target.entity))return false;
 if(!item.read_at)await markRead(item.id);
 navigate(item.link_target.id);
 return true;
}

/** English readers use the keys directly. Names and job titles stay in their saved words. */
export const notificationTemplates = {
 price_change: '{name}: {status} on {job}.',
 client_booked: 'Your visit for {job} is booked for {time}.',
 client_way: 'The technician is on the way for {job}.',
 client_started: 'The technician has started {job}.',
 client_done: '{job} is done. {count} after photos. Open the job to see them.',
 client_rescheduled: 'Your visit for {job} is now booked for {time}.',
 client_cancelled: '{job} has been cancelled.',
 client_price: 'The price for {job} is waiting for your approval. Open the job to approve or decline it.',
 client_update: 'Your request {job} was updated.',
 demo_push: 'Demo notification for {job}. Nothing was sent.',
 demo_late: 'Demo late job: {job}. Nothing was sent.',
 demo_stalled: 'Demo stalled job: {job}. Nothing was sent.',
 demo_document: 'Demo document expires in {days} days: {job}. Nothing was sent.',
 join: 'Your request to join was accepted. Open Find your company to continue.',
 team: '{name} wrote in Team space.',
 message: '{name} sent you a message.',
 on_way: '{name} is on the way for {job}.',
 callback: '{name} asked to cancel {job} after the technician was on the way or started. Please call him.',
 cancelled: '{name} cancelled {job}. You do not need to go.',
 assigned: '{name} assigned {job} to you.',
 reported: '{name} saved a report on {job}. Review it on the job.',
 roles: '{name} changed your roles. Your access now follows these roles.',
 suggested: '{name} suggested {job}. Review it on Suggested.',
 accepted: 'Your request {job} was accepted. Open your requests for details.',
 rejected: 'Your request {job} was not accepted. Open your requests for details.',
 moved: '{name} moved {job} from {from} to {to}.',
 moved_to: '{name} moved {job} to {to}.',
 status: '{name} updated the status of {job}.',
 quote: '{name} sent a price for {job}. Approve or decline it on the job.',
 quote_approved: '{name} approved the price for {job}.',
 quote_declined: '{name} declined the price for {job}.',
 visit: '{name} confirmed the visit time for {job}.',
 leave: '{name} asked for time off: {job}. Approve or decline it on Home.',
 leave_approved: '{name} approved your time off: {job}.',
 leave_declined: '{name} declined your time off: {job}.',
 internal: '{name} added an internal note on {job}.',
 comment: '{name} added a comment visible to the client to {job}.',
 unassigned: '{name} gave {job} to someone else. You do not need to go.',
 visit_changed: '{name} changed the visit time for {job}. Open the job to see the new time.',
 created: '{name} created {job}.',
 updated: '{name} updated {job}.',
 emergency: 'Emergency reported by {name}: {words}',
 emergency_review: '{name} reported a false alarm. Should the emergency job be cancelled? He said: {words}',
 low_rating: 'A client gave a low rating. Open the job.',
 day_ready: 'Your day is ready. Open Today.',
 day_changed: 'Your job changed. Open the job to see it.',
 cant_fix: 'Our technician could not fix this today. The supervisor will call you.',
 no_access: 'Our technician came at {time} but could not get in. Choose a new time.',
 part_booked: 'The part has arrived. Your visit is booked for {time}.',
 done: 'Your job is done. Please rate it. WO {n} {job}',
 more_one: '{count} more update on this job',
 more_many: '{count} more updates on this job',
} as const;
export type NotificationTemplate = { key: string; values: Record<string, string>; translatedValues?: string[]; runtime?: boolean; dateValues?: Record<string,string>; timezone?: string; photoLink?: string };

/** Price history is system copy even though its saved body predates notice templates. */
export function priceChangeEventTemplate(event: Detail['timeline'][number], actor: string, title: string): NotificationTemplate | undefined {
 if(event.kind!=='price_change')return undefined;
 const known=['Price changed','Waiting for a price','Waiting for the client','Price approved','Client said no','Client refused'];
 // Do not send an unknown saved body through a translated status parameter.
 const status=known.includes(event.body??'')?event.body!:'Price changed';
 return {key:notificationTemplates.price_change,values:{name:actor,status,job:event.work_order_title??title},translatedValues:['status']};
}

export function notificationTemplate(r: Record<string, any>, client = false): NotificationTemplate {
 const values: Record<string, string> = {name:r.actor_name??'Your team',job:r.work_order_title??r.current_title??'your job'};
 const translatedValues = [!r.actor_name||['Your team','Your admin','Your supervisor','System'].includes(r.actor_name)?'name':'',!r.work_order_title&&!r.current_title?'job':''].filter(Boolean);
 const make = (id: keyof typeof notificationTemplates): NotificationTemplate => ({key:notificationTemplates[id],values,translatedValues});
 if(client){
  const step=r.details?.to_status??r.to_status;
  const kind=r.kind;
  const statuses:Record<string,keyof typeof notificationTemplates>={scheduled:'client_booked',in_progress:'client_started',done:'client_done',cancelled:'client_cancelled'};
  const kinds:Record<string,keyof typeof notificationTemplates>={on_the_way:'client_way',quote_sent:'client_price',job_cancelled:'client_cancelled',visit_changed:'client_rescheduled',schedule_changed:'client_rescheduled'};
  const saved=kind==='job_next_step'&&r.job_step_body?savedReturnNotice(String(r.job_step_body)):null;
  const key=kind==='status_changed'?statuses[step]:kind==='price_change'&&r.details?.state==='pending'?'client_price':saved?.kind==='done'?'client_done':saved?.kind==='part_booked'?'client_booked':kind==='job_next_step'&&String(r.job_step_body).startsWith('Client refused.')?'client_cancelled':kinds[kind];
  if(key){
   const notice=make(key);
   if(key==='client_booked'||key==='client_rescheduled'){
    const at=r.details?.scheduled_for??r.notice_scheduled_for??r.scheduled_for;
    values.time=at?String(at):'Unscheduled';
    if(at)notice.dateValues={time:new Date(at).toISOString()};else translatedValues.push('time');
    notice.timezone=r.timezone??'Asia/Dubai';
   }
   if(key==='client_done'){
    values.count=String(r.after_photos??0);
    const id=r.work_order_id??r.entity_id;
    if(id)notice.photoLink=`/work-orders/${id}#photos`;
   }
   return notice;
  }
  if(r.timeline)return make('client_update');
 }
 // These columns predate templates. Recover saved bodies without any schema changes.
 const fallback = (body: string): NotificationTemplate => ({key:'{body}',values:{body,...(r.actor_name?{name:r.actor_name}:{}),...(r.work_order_title&&!['emergency','emergency_review'].includes(r.kind)?{job:r.work_order_title}:{})},runtime:true});
 if(['demo_push','demo_late','demo_stalled','demo_document'].includes(r.kind)) {
  if(r.kind==='demo_document')values.days=String(r.to_status);
  return make(r.kind as 'demo_push'|'demo_late'|'demo_stalled'|'demo_document');
 }
 if(r.kind==='job_next_step'&&r.job_step_body){
  const saved=savedReturnNotice(String(r.job_step_body));
  return saved?{key:notificationTemplates[saved.kind],values:saved.values}:fallback(String(r.job_step_body));
 }
 if(r.kind==='day_plan'){
  if(r.job_step_body===notificationTemplates.day_ready)return make('day_ready');
  if(r.job_step_body===notificationTemplates.day_changed)return make('day_changed');
  return fallback(String(r.job_step_body??r.message??''));
 }
 if(r.kind==='low_rating')return make('low_rating');
 if(r.kind==='emergency'||r.kind==='emergency_review') {
  const message=String(r.work_order_title??'');
  const match=r.kind==='emergency'?message.match(/^Emergency reported by (.*?): ([\s\S]*)$/):message.match(/^(.*?) reported a false alarm\. Should the emergency job be cancelled\? He said: ([\s\S]*)$/);
  if(!match)return fallback(message);
  if(!r.actor_name){values.name=match[1];translatedValues.splice(translatedValues.indexOf('name'),1);}
  values.words=match[2];return make(r.kind);
 }
 if(r.kind==='status_changed') {
  const labels=client?clientStatusLabels:statusLabels;
  if(r.from_status){values.from=labels[r.from_status]??label(r.from_status);translatedValues.push('from');}
  if(r.to_status){values.to=labels[r.to_status]??label(r.to_status);translatedValues.push('to');}
  return make(r.from_status&&r.to_status?'moved':r.to_status?'moved_to':'status');
 }
 if(r.kind==='suggestion_decided')return make(r.to_status==='approved'?'accepted':'rejected');
 if(r.kind==='quote_decided')return make(r.to_status==='approved'?'quote_approved':'quote_declined');
 if(r.kind==='leave_requested'||r.kind==='leave_decided') {
  if(!r.work_order_title){values.job=r.kind==='leave_requested'?'some days':'your days';translatedValues.push('job');}
  return make(r.kind==='leave_requested'?'leave':r.to_status==='approved'?'leave_approved':'leave_declined');
 }
 if(r.kind==='comment_added')return make(r.to_status==='internal'?'internal':'comment');
 const kinds:Record<string,keyof typeof notificationTemplates>={company_join_accepted:'join',team_message:'team',message_received:'message',on_the_way:'on_way',client_callback:'callback',job_cancelled:'cancelled',job_assigned:'assigned',job_reported:'reported',roles_changed:'roles',suggestion_received:'suggested',quote_sent:'quote',visit_confirmed:'visit',job_unassigned:'unassigned',visit_changed:'visit_changed',request_created:'created'};
 if(kinds[r.kind])return make(kinds[r.kind]);
 if(r.job_step_body||r.message)return fallback(String(r.job_step_body??r.message));
 return make('updated');
}

export function notificationParts(message: NotificationTemplate, words: Record<string,string> = {}, language = uiLang()) {
 const template=words[message.key]??message.key;
 return template.split(/(\{[a-z_]+\})/g).filter(Boolean).map(part=>{
  const name=part.match(/^\{([a-z_]+)\}$/)?.[1];
  const raw=name?message.values[name]:undefined;
  const value=name&&message.dateValues?.[name]?formatInLang(message.dateValues[name],{dateStyle:'full',timeStyle:'short',timeZone:message.timezone??'Asia/Dubai'},language,language):raw;
  return {text:value===undefined?part:message.translatedValues?.includes(name!)?(words[value]??value):value,parameter:name??null};
 });
}
export function renderNotification(message: NotificationTemplate, words: Record<string,string> = {}, language = uiLang()) {
 return notificationParts(message,words,language).map(part=>part.text).join('');
}
export function notificationMessage(r:Record<string,any>,client=false) {
 return renderNotification(notificationTemplate(r,client));
}

/** CMP08: job updates group newest first. Demo/test delivery notices stay separate so they never hide a real update. */
export function groupNotifications<T extends { id: string; read_at: string | null; link_target?: { entity: string; id: string } | null; kind?:string }>(items: T[]) {
  const out: { item: T; rest: T[] }[] = []; const at = new Map<string, number>();
  for (const n of items) {
    const key = !n.kind?.startsWith('demo_') && n.kind !== 'emergency' && n.kind !== 'emergency_review' && n.link_target && (n.link_target.entity === 'work_orders' || n.link_target.entity === 'work_order') ? `wo:${n.link_target.id}` : null;
    if (key && at.has(key)) { out[at.get(key)!].rest.push(n); continue; }
    if (key) at.set(key, out.length); out.push({ item: n, rest: [] });
  }
  return out;
}
