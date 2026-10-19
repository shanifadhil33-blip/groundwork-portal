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
 if(r.kind==='emergency'||r.kind==='emergency_review')return String(r.work_order_title);
 if(r.kind==='team_message')return `${actor} wrote in Team space.`;
 if(r.kind==='message_received')return `${actor} sent you a message.`;
 if(r.kind==='client_callback')return `${actor} asked to cancel ${title} after the technician was on the way or started. Please call him.`;
 if(r.kind==='job_cancelled')return `${actor} cancelled ${title}. You do not need to go.`;
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
 if(r.kind==='job_unassigned')return `${actor} gave ${title} to someone else. You do not need to go.`;
 if(r.kind==='visit_changed')return `${actor} changed the visit time for ${title}. Open the job to see the new time.`;
 if(r.kind==='request_created')return `${actor} created ${title}.`;
 return `${actor} updated ${title}.`;
}

/** CMP08: several updates on one job show as one row, newest first, with a count of the rest. */
export function groupNotifications<T extends { id: string; read_at: string | null; link_target?: { entity: string; id: string } | null; kind?:string }>(items: T[]) {
  const out: { item: T; rest: T[] }[] = []; const at = new Map<string, number>();
  for (const n of items) {
    const key = n.kind !== 'emergency' && n.kind !== 'emergency_review' && n.link_target && (n.link_target.entity === 'work_orders' || n.link_target.entity === 'work_order') ? `wo:${n.link_target.id}` : null;
    if (key && at.has(key)) { out[at.get(key)!].rest.push(n); continue; }
    if (key) at.set(key, out.length); out.push({ item: n, rest: [] });
  }
  return out;
}
