import { label, clientStatusLabels, statusLabels } from './work-orders';
type WorkNotification = {id:string;read_at:string|null;link_target:{entity:string;id:string}|null};
// Navigation waits for the read receipt so the bell stays in sync with the opened item.
export async function openNotificationTarget(item:WorkNotification,markRead:(id:string)=>Promise<unknown>,navigate:(id:string)=>void) {
 if(!item.link_target||!['work_order','work_orders','job_suggestions','time_off','members','conversations','team_space'].includes(item.link_target.entity))return false;
 if(!item.read_at)await markRead(item.id);
 navigate(item.link_target.id);
 return true;
}

export function notificationMessage(r:Record<string,any>, client=false) {
 const labels=client?clientStatusLabels:statusLabels, status=(value:string)=>labels[value]??label(value);
 const title=r.work_order_title??r.current_title??'your job',actor=r.actor_name??'Your team';
 if(r.kind==='message_received')return `${actor} sent you a message.`;
 if(r.kind==='job_assigned')return `${actor} assigned ${title} to you.`;
 if(r.kind==='job_reported')return `${actor} saved a report on ${title}. Review it on the job.`;
 if(r.kind==='roles_changed')return `${actor} changed your roles. Your access now follows these roles.`;
 if(r.kind==='suggestion_received')return `${actor} suggested ${title}. Review it on Suggested.`;
 if(r.kind==='suggestion_decided')return `Your request ${title} was ${r.to_status==='approved'?'accepted':'not accepted'}. Open your requests for details.`;
 if(r.kind==='status_changed')return r.from_status&&r.to_status?`${actor} moved ${title} from ${status(r.from_status)} to ${status(r.to_status)}.`:r.to_status?`${actor} moved ${title} to ${status(r.to_status)}.`:`${actor} updated the status of ${title}.`;
 if(r.kind==='quote_sent')return `${actor} sent a price for ${title}. Approve or decline it on the job.`;
 if(r.kind==='quote_decided')return `${actor} ${r.to_status==='approved'?'approved':'declined'} the price for ${title}.`;
 if(r.kind==='visit_confirmed')return `${actor} confirmed the visit time for ${title}.`;
 if(r.kind==='leave_requested')return `${actor} asked for time off: ${r.work_order_title??'some days'}. Approve or decline it on Home.`;
 if(r.kind==='leave_decided')return `${actor} ${r.to_status==='approved'?'approved':'declined'} your time off: ${r.work_order_title??'your days'}.`;
 if(r.kind==='comment_added')return r.to_status==='internal'?`${actor} added an internal note on ${title}.`:`${actor} added a comment visible to the client to ${title}.`;
 if(r.kind==='request_created')return `${actor} created ${title}.`;
 return `${actor} updated ${title}.`;
}
