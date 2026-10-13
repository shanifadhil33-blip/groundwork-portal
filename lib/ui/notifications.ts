import { label, clientStatusLabels, statusLabels } from './work-orders';
type WorkNotification = {id:string;read_at:string|null;link_target:{entity:string;id:string}|null};
// Navigation waits for the read receipt so the bell stays in sync with the opened item.
export async function openNotificationTarget(item:WorkNotification,markRead:(id:string)=>Promise<unknown>,navigate:(id:string)=>void) {
 if(!item.link_target||!['work_order','work_orders'].includes(item.link_target.entity))return false;
 if(!item.read_at)await markRead(item.id);
 navigate(item.link_target.id);
 return true;
}

export function notificationMessage(r:Record<string,any>, client=false) {
 const labels=client?clientStatusLabels:statusLabels, status=(value:string)=>labels[value]??label(value);
 const title=r.work_order_title??r.current_title??'your job',actor=r.actor_name??'Your team';
 if(r.kind==='status_changed')return r.from_status&&r.to_status?`${actor} moved ${title} from ${status(r.from_status)} to ${status(r.to_status)}.`:r.to_status?`${actor} moved ${title} to ${status(r.to_status)}.`:`${actor} updated the status of ${title}.`;
 if(r.kind==='leave_requested')return `${actor} asked for time off: ${r.work_order_title??'some days'}. Approve or decline it on Home.`;
 if(r.kind==='leave_decided')return `${actor} ${r.to_status==='approved'?'approved':'declined'} your time off: ${r.work_order_title??'your days'}.`;
 if(r.kind==='comment_added')return `${actor} added a comment visible to the client to ${title}.`;
 if(r.kind==='request_created')return `${actor} created ${title}.`;
 return `${actor} updated ${title}.`;
}
