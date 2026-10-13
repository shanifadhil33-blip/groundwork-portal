import { inWorkspace } from './shared';
import { listSuggestions } from './suggestions';
import { listNotifications } from './notifications';
export async function needsAttention(user:string,ws:string){
 return inWorkspace(user,ws,async c=>{
  const suggestions=await listSuggestions(user,ws),notifications=await listNotifications(user,ws,new URLSearchParams('unread=true&pageSize=20'));
  const pending=suggestions.data.filter(s=>s.status==='pending');
  return {suggested_jobs:pending.length,suggestions:pending,unread_notifications:notifications.unread_count,notifications:notifications.data,summary:c.role==='admin'||c.role==='staff'?`You have ${pending.length} suggested jobs`:`You have ${pending.length} requests waiting for review`};
 });
}
