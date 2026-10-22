import { priceChangeOn, assertPriceReleased } from './price-changes';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import { allow, inWorkspace, uuid } from './shared';
import { z } from 'zod';
/**
 * Universal rule 17 for jobs. Cancel is the everyday way to drop a job (status change, Undo by Restore).
 * Restore brings a cancelled job back. Delete is only for a job made by mistake with no activity at all;
 * anything with history is cancelled instead, so reports never break. Office only, checked here on the server.
 */
const back=z.object({status:z.enum(['open','scheduled','in_progress','waiting_on_parts']).optional()}).strict();
export async function restoreJob(user:string,ws:string,id:string,body:unknown){
 uuid.parse(id);const d=back.parse(body??{});
 const job=await inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query('SELECT id,status,scheduled_for FROM work_orders WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];});
 if(!job)throw missing();
 if(job.status!=='cancelled')throw new ApiError(409,'not_cancelled','This job is not cancelled.');
 let status=d.status??(job.scheduled_for?'scheduled':'open');
 if(status==='scheduled'&&!job.scheduled_for)status='open';
 return withSystem(async db=>{
  const m=(await db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL FOR SHARE',[ws,user])).rows[0];
  if(!m||!['admin','staff'].includes(m.role))throw new ApiError(403,'forbidden','You cannot change this job.');
  const current=(await db.query('SELECT status FROM work_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,id])).rows[0];
  if(current?.status!=='cancelled')throw new ApiError(409,'changed','This job changed. Refresh and try again.');
  if((await priceChangeOn(db,ws,id))?.state==='refused')throw new ApiError(409,'client_refused','The client refused. Start a new linked request.');
  if(status==='in_progress')await assertPriceReleased(db,ws,id);
  return (await db.query('UPDATE work_orders SET status=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING *',[ws,id,status])).rows[0];
 },user);
}
/** What would stop a delete: anything beyond the job being created. */
export async function jobImpact(user:string,ws:string,id:string){
 uuid.parse(id);
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);
  const j=(await c.db.query('SELECT id,status,assignee_id FROM work_orders WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];if(!j)throw missing();
  const n=async(sql:string)=>Number((await c.db.query(sql,[ws,id])).rows[0].n);
  const notes=await n('SELECT count(*) n FROM comments WHERE workspace_id=$1 AND work_order_id=$2');
  const photos=await n('SELECT count(*) n FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2');
  const parts=await n('SELECT count(*) n FROM supplier_orders WHERE workspace_id=$1 AND work_order_id=$2');
  const changes=await n("SELECT count(*) n FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2 AND kind<>'created'");
  return {status:j.status,notes,photos,parts,changes,can_delete:j.status==='open'&&!j.assignee_id&&!notes&&!photos&&!parts&&!changes};
 });
}
export async function deleteJob(user:string,ws:string,id:string){
 const i=await jobImpact(user,ws,id);
 if(!i.can_delete)throw new ApiError(409,'has_history','This job has activity, so it is kept for history. Cancel it instead.');
 try{await withSystem(async db=>{await db.query("DELETE FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2 AND kind='created'",[ws,id]);await db.query("DELETE FROM work_orders WHERE workspace_id=$1 AND id=$2 AND status='open'",[ws,id]);},user);}
 catch(e){if((e as {code?:string}).code==='23503')throw new ApiError(409,'has_history','This job is linked to other records, so it is kept for history. Cancel it instead.');throw e;}
 return {deleted:true};
}
