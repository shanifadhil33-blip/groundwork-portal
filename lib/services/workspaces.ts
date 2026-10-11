import { assertRealUser } from './demo';
import { localDate, overdueSql } from '../dates';
import { z } from 'zod';
import { withUser } from '../db';
import { invalid } from '../http';
import { allow, inWorkspace, name, replay, row, update } from './shared';
export const timezone = z.string().refine(value => { try { new Intl.DateTimeFormat('en',{timeZone:value}); return true; } catch { return false; } },'Choose a valid IANA timezone.');
const schema=z.object({name,timezone:timezone.default('Asia/Dubai')}).strict();
export async function me(user: string) {
 return withUser(user,async db=>({
  user:(await db.query('SELECT * FROM visible_user($1)',[user])).rows[0],
  memberships:(await db.query('SELECT m.workspace_id,m.role,m.client_id,w.name AS workspace_name,c.name AS client_name FROM members m JOIN workspaces w ON w.id=m.workspace_id LEFT JOIN clients c ON c.id=m.client_id WHERE m.user_id=$1 ORDER BY w.name',[user])).rows,
 }));
}
export async function createWorkspace(user:string,body:unknown,key?:string) {
 await assertRealUser(user);
 const data=schema.parse(body);
 return withUser(user,db=>replay(db,user,'workspaces',key,data,async()=>(await db.query('SELECT * FROM create_workspace($1,$2)',[data.name,data.timezone])).rows[0]));
}
export async function getWorkspace(user:string,ws:string) { return inWorkspace(user,ws,c=>row(c,'workspaces',ws)); }
export async function patchWorkspace(user:string,ws:string,body:unknown) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin']);const data=z.object({name:z.string().trim().min(1).max(80).optional(),timezone:timezone.optional()}).strict().parse(body);if(!Object.keys(data).length)throw invalid('Provide at least one change.');return update(c,'workspaces',ws,data);});
}
export async function deleteWorkspace(user:string,ws:string,body:unknown) {
 await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const data=z.object({confirm_name:z.string()}).strict().parse(body);
  const w=await row(c,'workspaces',ws,true);
  if(data.confirm_name!==w.name)throw invalid('Type the workspace name exactly.','confirm_name');
  await c.db.query('SELECT delete_workspace($1)',[ws]);return {deleted:true};
 });
}
export async function dashboard(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{
  const statuses=['open','scheduled','in_progress','waiting_on_parts','done','cancelled'];
  const counts=(await c.db.query(`SELECT ${statuses.map(s=>`count(*) FILTER (WHERE status='${s}')::int AS ${s}`).join(',')},
   count(*) FILTER (WHERE ${overdueSql})::int AS overdue,
   (SELECT count(*)::int FROM import_rows WHERE workspace_id=$1 AND queued AND decision='pending') AS pending_queue_rows,
   (SELECT max(finished_at) FROM supplier_sync_runs WHERE workspace_id=$1) AS last_supplier_sync_at,
   (SELECT timezone FROM workspaces WHERE id=$1) AS timezone
   FROM work_orders WHERE workspace_id=$1`,[ws])).rows[0];
  const by_status=Object.fromEntries(statuses.map(s=>[s,counts[s]]));
  const {timezone,overdue,pending_queue_rows,last_supplier_sync_at}=counts;
  return {timezone,today:localDate(Date.now(),timezone),by_status,overdue,waiting_on_parts:by_status.waiting_on_parts,pending_queue_rows,last_supplier_sync_at};
 });
}

export async function listWorkspaces(user:string){return withUser(user,async db=>(await db.query('SELECT w.* FROM workspaces w JOIN members m ON m.workspace_id=w.id WHERE m.user_id=$1 ORDER BY w.name',[user])).rows);}
