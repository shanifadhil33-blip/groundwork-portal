import { z } from 'zod';
import { withUser } from '../db';
import { invalid } from '../http';
import { allow, inWorkspace, name, replay, row, update } from './shared';
const timezone = z.string().refine(value => { try { new Intl.DateTimeFormat('en',{timeZone:value}); return true; } catch { return false; } },'Choose a valid IANA timezone.');
const schema=z.object({name,timezone:timezone.default('Asia/Dubai')}).strict();
export async function me(user: string) {
 return withUser(user,async db=>({
  user:(await db.query('SELECT * FROM visible_user($1)',[user])).rows[0],
  memberships:(await db.query('SELECT m.workspace_id,m.role,m.client_id,w.name AS workspace_name,c.name AS client_name FROM members m JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN clients c ON c.id=m.client_id WHERE m.user_id=$1 ORDER BY w.name',[user])).rows,
 }));
}
export async function createWorkspace(user:string,body:unknown,key?:string) {
 const data=schema.parse(body);
 return withUser(user,db=>replay(db,user,'workspaces',key,data,async()=>(await db.query('SELECT * FROM create_workspace($1,$2)',[data.name,data.timezone])).rows[0]));
}
export async function getWorkspace(user:string,ws:string) { return inWorkspace(user,ws,c=>row(c,'workspaces',ws)); }
export async function patchWorkspace(user:string,ws:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const data=z.object({name:name.optional(),timezone:timezone.optional()}).strict().parse(body);if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'workspaces',ws,data);});
}
export async function deleteWorkspace(user:string,ws:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const data=z.object({confirm_name:z.string()}).strict().parse(body);
  const w=await row(c,'workspaces',ws,true);
  if(data.confirm_name!==w.name)throw invalid('Type the workspace name exactly.','confirm_name');
  await c.db.query('SELECT delete_workspace($1)',[ws]);return {deleted:true};
 });
}
export async function dashboard(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{
  const counts=(await c.db.query('SELECT status,count(*)::int AS count FROM work_orders WHERE workspace_id=$1 GROUP BY status',[ws])).rows;
  const by_status=Object.fromEntries(['open','scheduled','in_progress','waiting_on_parts','done','cancelled'].map(s=>[s,0]));
  for(const item of counts)by_status[item.status]=item.count;
  const overdue=(await c.db.query("SELECT count(*)::int AS count FROM work_orders WHERE workspace_id=$1 AND scheduled_for<now() AND status NOT IN ('done','cancelled')",[ws])).rows[0].count;
  const pending_queue_rows=(await c.db.query("SELECT count(*)::int AS count FROM import_rows WHERE workspace_id=$1 AND decision='pending'",[ws])).rows[0].count;
  const last_supplier_sync_at=(await c.db.query('SELECT max(created_at) AS at FROM supplier_events WHERE workspace_id=$1',[ws])).rows[0].at;
  return {by_status,overdue,waiting_on_parts:by_status.waiting_on_parts,pending_queue_rows,last_supplier_sync_at};
 });
}
