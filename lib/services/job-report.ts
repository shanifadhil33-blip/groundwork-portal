import { z } from 'zod';
import { ApiError } from '../http';
import { pushJobChange } from './push';
import { withSystem } from '../db';
import { allow, inWorkspace, replay } from './shared';
import type { PoolClient } from 'pg';

export const OUTCOMES = ['fixed', 'temporary', 'needs_part', 'cant_fix'] as const;
export const OUTCOME_LABELS: Record<(typeof OUTCOMES)[number], string> = { fixed: 'Fixed', temporary: 'Temporary fix', needs_part: 'Needs a part', cant_fix: "Can't be fixed" };
const reportSchema = z.object({ problem: z.string().trim().max(2000).default(''), work: z.string().trim().max(2000).default(''), outcome: z.enum(OUTCOMES).default('fixed'), updated_at: z.iso.datetime({offset:true}) }).strict();
/** Where the job goes next. Fixed and Temporary fix close the visit; Needs a part waits for parts; Can't be fixed stays open for the supervisor. */
const nextStatus = { fixed: 'done', temporary: 'done', needs_part: 'waiting_on_parts', cant_fix: null } as const;

/** The technician's job report, in his own words. Nothing is required: an empty report still closes the job as Fixed. */
export async function saveJobReport(user:string,ws:string,id:string,body:unknown,key?:string){
 const data=reportSchema.parse(body);
 // The owner write is limited to this report after checking current membership and assignment.
 // Report fields, status history and the replay result commit together.
 let before:Parameters<typeof pushJobChange>[1]=null,after:Parameters<typeof pushJobChange>[2]|null=null;
 const result=await withSystem(async db=>{
  const member=(await db.query("SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL",[ws,user])).rows[0];
  if(!member||!['admin','staff','technician'].includes(member.role))throw new ApiError(403,'forbidden','You cannot report on this job.');
  const o=(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,id])).rows[0];
  if(!o||(member.role==='technician'&&o.assignee_id!==user))throw new ApiError(403,'forbidden','This job is not yours.');
  return replay(db,user,ws+'/work-orders/'+id+'/report',key,data,async()=>{
   if(o.status==='done'||o.status==='cancelled')throw new ApiError(409,'closed','This job is already closed.');
   if(new Date(data.updated_at).getTime()!==new Date(o.updated_at).getTime())throw new ApiError(409,'stale','This job changed. Open it and review your report before sending again.');
   await db.query('UPDATE work_orders SET report_problem=$3,report_work=$4,report_outcome=$5,report_at=now(),report_by=$6 WHERE workspace_id=$1 AND id=$2',[ws,id,data.problem||null,data.work||null,data.outcome,user]);
   const target=nextStatus[data.outcome];
   const path:string[]=target==='done'?(o.status==='open'?['scheduled','in_progress','done']:o.status==='scheduled'?['in_progress','done']:['done']):target==='waiting_on_parts'?(o.status==='open'?['scheduled','in_progress','waiting_on_parts']:o.status==='scheduled'?['in_progress','waiting_on_parts']:o.status==='waiting_on_parts'?[]:['waiting_on_parts']):[];
   for(const status of path)await db.query('UPDATE work_orders SET status=$3 WHERE workspace_id=$1 AND id=$2',[ws,id,status]);
   before=o;after=(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];
   return {status:path.at(-1)??o.status,outcome:data.outcome,record:await recordOn(db,ws,user)};
  });
 },user);
 if(after)await pushJobChange(user,before,after);
 return result;
}
async function recordOn(db:PoolClient,ws:string,user:string){return (await db.query(`SELECT count(*) FILTER (WHERE date_trunc('month',coalesce(report_at,updated_at) AT TIME ZONE w.timezone)=date_trunc('month',now() AT TIME ZONE w.timezone))::int AS month,count(*)::int AS total FROM work_orders o JOIN workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=$1 AND o.assignee_id=$2 AND o.status='done'`,[ws,user])).rows[0] as {month:number;total:number};}

/** Jobs a person finished: this month and in total. Office can read anyone on the team; a technician reads his own. */
export async function jobRecord(user: string, ws: string, of: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    if (c.role === 'technician' && of !== user) throw new ApiError(403, 'forbidden', 'You can see your own record.');
    return (await c.db.query(`SELECT count(*) FILTER (WHERE date_trunc('month', coalesce(report_at, updated_at) AT TIME ZONE w.timezone) = date_trunc('month', now() AT TIME ZONE w.timezone))::int AS month, count(*)::int AS total
      FROM work_orders o JOIN workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=$1 AND o.assignee_id=$2 AND o.status='done'`, [ws, of])).rows[0] as { month: number; total: number };
  });
}
