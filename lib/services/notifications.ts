import { z } from 'zod';
import { withUser } from '../db';
import { missing } from '../http';
import { inWorkspace, uuid } from './shared';
import { paging, parseQuery, feedOffset } from './feed';
export async function unreadCount(user:string) {
 return withUser(user,async db=>{const workspaces=(await db.query('SELECT workspace_id,count(*)::int AS unread_count FROM notifications WHERE read_at IS NULL GROUP BY workspace_id ORDER BY workspace_id')).rows;return {unread_count:workspaces.reduce((n,r)=>n+r.unread_count,0),workspaces};});
}
export async function listNotifications(user:string,ws:string,params:URLSearchParams) {
 return inWorkspace(user,ws,async c=>{
  const q=parseQuery(params,{...paging,unread:z.enum(['true','false']).optional()}),page=feedOffset(user,ws,q);
  const where='n.workspace_id=$1'+(q.unread===undefined?'':q.unread==='true'?' AND n.read_at IS NULL':' AND n.read_at IS NOT NULL');
  const total=(await c.db.query(`SELECT count(*)::int AS n FROM notifications n WHERE ${where}`,[ws])).rows[0].n;
  const unread_count=(await c.db.query('SELECT count(*)::int AS n FROM notifications WHERE workspace_id=$1 AND read_at IS NULL',[ws])).rows[0].n;
  const rows=(await c.db.query(`SELECT n.*,w.id AS visible_id,w.title AS work_order_title FROM notifications n LEFT JOIN work_orders w ON n.entity='work_orders' AND w.workspace_id=n.workspace_id AND w.id=n.entity_id WHERE ${where} ORDER BY n.created_at DESC,n.id DESC LIMIT $2 OFFSET $3`,[ws,q.pageSize,page.offset])).rows;
  return {data:rows.map(r=>({id:r.id,kind:r.kind,entity:r.entity,entity_id:r.entity_id,message:r.kind==='status_changed'?`Status changed for ${r.work_order_title??'your work order'}.`:r.kind==='comment_added'?`A new comment was added to ${r.work_order_title??'your work order'}.`:`There is an update to ${r.work_order_title??'your work order'}.`,created_at:r.created_at,read_at:r.read_at,link_target:r.visible_id?{entity:r.entity,id:r.visible_id}:null})),total,unread_count,page:Math.floor(page.offset/q.pageSize)+1,pageSize:q.pageSize,next_cursor:page.next(total)};
 });
}
export async function markNotification(user:string,ws:string,id:string,read:boolean) {
 return inWorkspace(user,ws,async c=>{uuid.parse(id);const r=(await c.db.query(`UPDATE notifications SET read_at=${read?'coalesce(read_at,clock_timestamp())':'NULL'} WHERE workspace_id=$1 AND id=$2 RETURNING id,read_at`,[ws,id])).rows[0];if(!r)throw missing();return r;});
}
export async function readAll(user:string,ws:string) {return inWorkspace(user,ws,async c=>({changed:(await c.db.query('UPDATE notifications SET read_at=clock_timestamp() WHERE workspace_id=$1 AND read_at IS NULL',[ws])).rowCount??0}));}
