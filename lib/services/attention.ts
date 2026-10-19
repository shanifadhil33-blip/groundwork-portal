import { unreadMessages } from './messages';
import { inWorkspace } from './shared';
import { listSuggestions } from './suggestions';
import { listNotifications } from './notifications';
type Unread={conversation_id:string|null;work_order_id:string|null;order_number:number|null;sender_name:string;thread_kind:string};
/** Unread messages grouped per job or direct chat, with a count per sender (Oct 19: the list repeated "Sam messaged about WO 6"). Newest first. */
export function groupUnread(items:Unread[]){
 const groups=new Map<string,{kind:'job'|'direct';order_number:number|null;total:number;senders:Map<string,number>}>();
 for(const m of items){if(m.thread_kind==='team')continue;const key=m.work_order_id?`job:${m.work_order_id}`:`chat:${m.conversation_id}`;
  const g=groups.get(key)??{kind:m.work_order_id?'job' as const:'direct' as const,order_number:m.order_number,total:0,senders:new Map<string,number>()};
  g.total++;g.senders.set(m.sender_name,(g.senders.get(m.sender_name)??0)+1);groups.set(key,g);}
 return [...groups.values()].map(g=>{const who=[...g.senders].map(([name,n])=>`${n} from ${name}`).join(', ');
  return {kind:g.kind,order_number:g.order_number,total:g.total,senders:Object.fromEntries(g.senders),summary:g.kind==='job'?`WO ${g.order_number}: ${who}`:`Direct chat: ${who}`};});
}
/** The no AI answer to what needs attention: counts first, then unread messages per job or chat, never the same line twice. */
export function attentionReply(a:{summary:string;message_groups:ReturnType<typeof groupUnread>}){
 const groups=a.message_groups,total=groups.reduce((n,g)=>n+g.total,0);
 if(!total)return `${a.summary}.
You have no unread messages.`;
 const onJobs=groups.filter(g=>g.kind==='job').reduce((n,g)=>n+g.total,0),direct=total-onJobs;
 const split=[onJobs?`${onJobs} on ${groups.filter(g=>g.kind==='job').length===1?'1 job':`${groups.filter(g=>g.kind==='job').length} jobs`}`:'',direct?`${direct} in direct chats`:''].filter(Boolean).join(' and ');
 const lines=groups.slice(0,6).map(g=>`• ${g.summary}`),more=groups.length-lines.length;
 return [`${a.summary}.`,`You have ${total===1?'1 unread message':`${total} unread messages`}: ${split}.`,...lines,...(more>0?[`and ${more} more ${more===1?'conversation':'conversations'}.`]:[])].join('\n');
}
export async function needsAttention(user:string,ws:string){
 return inWorkspace(user,ws,async c=>{
  const suggestions=await listSuggestions(user,ws),notifications=await listNotifications(user,ws,new URLSearchParams('unread=true&pageSize=20'));
  const unread=await unreadMessages(user,ws);
  const messages=unread.data.filter(m=>m.thread_kind!=='team').map(m=>({...m,summary:m.order_number?`${m.sender_name} messaged about WO ${m.order_number}`:`${m.sender_name} sent you a message`}));
  const pending=suggestions.data.filter(s=>s.status==='pending');
  const leave=c.role==='client'?[]:(await c.db.query("SELECT id,user_id,kind,starts_on,ends_on FROM time_off WHERE workspace_id=$1 AND status='pending'",[ws])).rows;
  const quotes=(await c.db.query("SELECT id,title,quote_amount FROM work_orders WHERE workspace_id=$1 AND quote_status='pending'",[ws])).rows;
  return {team_space_messages:unread.team_unread_count,unread_messages:unread.direct_unread_count,messages,message_groups:groupUnread(unread.data as Unread[]),leave_requests:leave,pending_quotes:quotes,suggested_jobs:pending.length,suggestions:pending,unread_notifications:notifications.unread_count,notifications:notifications.data,summary:`${c.role==='admin'||c.role==='staff'?`You have ${pending.length===1?'1 suggested job':`${pending.length} suggested jobs`}`:`You have ${pending.length===1?'1 request':`${pending.length} requests`} waiting for review`}${unread.team_unread_count?`\n${unread.team_unread_count===1?'1 new message':`${unread.team_unread_count} new messages`} in Team space`:''}`};
 });
}
