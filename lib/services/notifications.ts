import { contactRows } from './contact-names';
import { personalNames } from '../contact-names';
import { notificationMessage } from '../ui/notifications';
import { z } from 'zod';
import { withUser } from '../db';
import { missing } from '../http';
import { inWorkspace, uuid } from './shared';
import { paging, parseQuery, feedOffset } from './feed';
export async function unreadCount(user:string) {
 return withUser(user,async db=>{const workspaces=(await db.query('SELECT workspace_id,count(*)::int AS unread_count FROM notifications WHERE user_id=$1 AND read_at IS NULL GROUP BY workspace_id ORDER BY workspace_id',[user])).rows;return {unread_count:workspaces.reduce((n,r)=>n+r.unread_count,0),workspaces};});
}
export async function listNotifications(user:string,ws:string,params:URLSearchParams) {
 return inWorkspace(user,ws,async c=>{
  const q=parseQuery(params,{...paging,unread:z.enum(['true','false']).optional()}),page=feedOffset(user,ws,q);
  const readFilter=q.unread===undefined?'true':q.unread==='true'?'read_at IS NULL':'read_at IS NOT NULL';
  const where='n.workspace_id=$1 AND n.user_id=$4 AND '+readFilter;
  const counts=(await c.db.query(`SELECT count(*) FILTER (WHERE ${readFilter})::int AS total,count(*) FILTER (WHERE read_at IS NULL)::int AS unread_count FROM notifications WHERE workspace_id=$1 AND user_id=$2`,[ws,user])).rows[0];
  const {total,unread_count}=counts;
  const rows=(await c.db.query(`SELECT n.*,w.id AS visible_id,w.title AS current_title,s.id AS suggestion_id,t.id AS leave_id,c.id AS conversation_id FROM notifications n LEFT JOIN work_orders w ON n.entity='work_orders' AND w.workspace_id=n.workspace_id AND w.id=n.entity_id ${c.role==='technician'?'AND w.assignee_id=n.user_id ':''}LEFT JOIN job_suggestions s ON n.entity='job_suggestions' AND s.workspace_id=n.workspace_id AND s.id=n.entity_id LEFT JOIN time_off t ON n.kind IN ('leave_requested','leave_decided') AND t.workspace_id=n.workspace_id AND t.id=n.entity_id LEFT JOIN conversations c ON n.entity IN ('conversations','team_space') AND c.workspace_id=n.workspace_id AND c.id=n.entity_id WHERE ${where} ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`,[ws,q.pageSize,page.offset,user])).rows;
  const named=personalNames(rows,await contactRows(c.db,user,ws));
  return {data:named.map(r=>({id:r.id,kind:r.kind,priority:r.kind==='emergency'?'urgent':undefined,entity:r.entity,entity_id:r.entity_id,message:notificationMessage(r,c.role==='client'),created_at:r.created_at,read_at:r.read_at,link_target:r.visible_id?{entity:r.entity,id:r.visible_id}:r.suggestion_id?{entity:'job_suggestions',id:r.suggestion_id}:r.leave_id?{entity:'time_off',id:r.leave_id}:r.conversation_id?{entity:r.entity==='team_space'?'team_space':'conversations',id:r.conversation_id}:r.kind==='roles_changed'?{entity:'members',id:user}:null})),total,unread_count,page:Math.floor(page.offset/q.pageSize)+1,pageSize:q.pageSize,next_cursor:page.next(total)};
 });
}
export async function markNotification(user:string,ws:string,id:string,read:boolean) {
 return inWorkspace(user,ws,async c=>{uuid.parse(id);const r=(await c.db.query(`UPDATE notifications SET read_at=${read?'coalesce(read_at,clock_timestamp())':'NULL'} WHERE workspace_id=$1 AND id=$2 RETURNING id,read_at`,[ws,id])).rows[0];if(!r)throw missing();return r;});
}
export async function readAll(user:string,ws:string) {return inWorkspace(user,ws,async c=>({changed:(await c.db.query('UPDATE notifications SET read_at=clock_timestamp() WHERE workspace_id=$1 AND read_at IS NULL',[ws])).rowCount??0}));}
