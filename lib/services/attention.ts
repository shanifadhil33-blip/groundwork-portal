import { unreadMessages } from './messages';
import { inWorkspace } from './shared';
import { listSuggestions } from './suggestions';
import { listNotifications } from './notifications';
export async function needsAttention(user:string,ws:string){
 return inWorkspace(user,ws,async c=>{
  const suggestions=await listSuggestions(user,ws),notifications=await listNotifications(user,ws,new URLSearchParams('unread=true&pageSize=20'));
  const unread=await unreadMessages(user,ws);
  const messages=unread.data.filter(m=>m.thread_kind!=='team').map(m=>({...m,summary:m.order_number?`${m.sender_name} messaged about WO ${m.order_number}`:`${m.sender_name} sent you a message`}));
  const pending=suggestions.data.filter(s=>s.status==='pending');
  const leave=c.role==='client'?[]:(await c.db.query("SELECT id,user_id,kind,starts_on,ends_on FROM time_off WHERE workspace_id=$1 AND status='pending'",[ws])).rows;
  const quotes=(await c.db.query("SELECT id,title,quote_amount FROM work_orders WHERE workspace_id=$1 AND quote_status='pending'",[ws])).rows;
  return {team_space_messages:unread.team_unread_count,unread_messages:unread.direct_unread_count,messages,leave_requests:leave,pending_quotes:quotes,suggested_jobs:pending.length,suggestions:pending,unread_notifications:notifications.unread_count,notifications:notifications.data,summary:`${c.role==='admin'||c.role==='staff'?`You have ${pending.length===1?'1 suggested job':`${pending.length} suggested jobs`}`:`You have ${pending.length===1?'1 request':`${pending.length} requests`} waiting for review`}${unread.team_unread_count?`\n${unread.team_unread_count===1?'1 new message':`${unread.team_unread_count} new messages`} in Team space`:''}`};
 });
}
