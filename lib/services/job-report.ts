import { reportNextNotice } from './job-next-step';
import { z } from 'zod';
import { ApiError } from '../http';
import { pushJobChange } from './push';
import { withSystem } from '../db';
import { allow, inWorkspace, replay } from './shared';
import type { PoolClient } from 'pg';
import { useDemoRatingReader } from './demo-rating-reader';

export const OUTCOMES = ['fixed', 'temporary', 'needs_part', 'cant_fix'] as const;
export const OUTCOME_LABELS: Record<(typeof OUTCOMES)[number], string> = { fixed: 'Fixed', temporary: 'Temporary fix', needs_part: 'Needs a part', cant_fix: "Can't be fixed" };
const reportSchema = z.object({ problem: z.string().trim().max(2000).default(''), part: z.string().trim().max(200).default(''), work: z.string().trim().max(2000).default(''), outcome: z.enum(OUTCOMES).default('fixed'), problem_en: z.string().trim().max(2000).optional(), work_en: z.string().trim().max(2000).optional(), language: z.string().max(12).optional(), updated_at: z.iso.datetime({offset:true}) }).strict();
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
   await db.query('UPDATE work_orders SET report_problem=$3,report_work=$4,report_outcome=$5,report_at=now(),report_by=$6,report_problem_en=$7,report_work_en=$8,report_language=$9,report_part=$10 WHERE workspace_id=$1 AND id=$2',[ws,id,data.problem||null,data.work||null,data.outcome,user,data.problem_en||null,data.work_en||null,data.language||null,data.part||null]);
   const target=nextStatus[data.outcome];
   const path:string[]=target==='done'?(o.status==='open'?['scheduled','in_progress','done']:o.status==='scheduled'?['in_progress','done']:['done']):target==='waiting_on_parts'?(o.status==='open'?['scheduled','in_progress','waiting_on_parts']:o.status==='scheduled'?['in_progress','waiting_on_parts']:o.status==='waiting_on_parts'?[]:['waiting_on_parts']):[];
   for(const status of path)await db.query('UPDATE work_orders SET status=$3 WHERE workspace_id=$1 AND id=$2',[ws,id,status]);
   await reportNextNotice(db,ws,user,o,data.outcome);
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

/** TECH08: turn his spoken words into a draft report. Nothing is saved here; he confirms with Job done. */
export async function voiceDraft(user:string,ws:string,id:string,body:unknown){
 const d=z.object({words:z.string().trim().min(1).max(4000),language:z.string().max(12).default('en')}).strict().parse(body);
 const job=await inWorkspace(user,ws,async c=>{allow(c,['admin','staff','technician']);const o=(await c.db.query('SELECT id,title,assignee_id,status FROM work_orders WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];if(!o||(c.role==='technician'&&o.assignee_id!==user))throw new ApiError(403,'forbidden','This job is not yours.');return o;});
 const { fillFromWords, missingQuestion } = await import('../voice-report');
 const r=await fillFromWords(d.words,d.language,job.title);
 // AI down: keep his words as what he did, and ask how it ended. Never guess.
 if(!r)return {problem:'',work:d.words,outcome:null,problem_en:'',work_en:'',question:missingQuestion(d.language,{problem:'',outcome:null}),ai:false};
 return {...r,ai:true};
}

const fixesSchema = z.object({ month: z.enum(['this', 'last', 'all']).default('this'), q: z.string().trim().max(200).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), of: z.uuid().optional() }).strict();
/** Personal completed work, with calendar months in the workspace time zone. All reads retain RLS. */
export async function myFixes(user: string, ws: string, options: { month?: 'this' | 'last' | 'all'; q?: string; page?: number; of?: string } = {}) {
  const d = fixesSchema.parse(options);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    const of = d.of ?? user;
    if (c.role === 'technician' && of !== user) throw new ApiError(403, 'forbidden', 'You can see your own record.');
    const base = `FROM work_orders o JOIN workspaces w ON w.id=o.workspace_id LEFT JOIN sites s ON s.id=o.site_id AND s.workspace_id=o.workspace_id
      WHERE o.workspace_id=$1 AND o.assignee_id=$2 AND o.status='done'`;
    const month = `date_trunc('month', coalesce(o.report_at,o.updated_at) AT TIME ZONE w.timezone)`;
    const current = `date_trunc('month', now() AT TIME ZONE w.timezone)`;
    const summary = (await c.db.query(`SELECT count(*) FILTER (WHERE ${month}=${current})::int AS month,
      count(*) FILTER (WHERE ${month}=${current} - interval '1 month')::int AS last_month, count(*)::int AS total ${base}`, [ws, of])).rows[0] as { month: number; last_month: number; total: number };
    // High ratings only. The technician cannot read the rating rows, and a low rating stays with the supervisor.
    const thanks = await withSystem(async db => {
      // FORCE RLS also applies to the seed owner. In a live sandbox, use its
      // own admin to read this high-rating count after the viewer check above.
      // No rating text or low-rating count leaves this transaction.
      await useDemoRatingReader(db, ws, user);
      return (await db.query('SELECT count(*)::int AS n FROM job_ratings r JOIN work_orders j ON j.id=r.work_order_id WHERE j.workspace_id=$1 AND j.assignee_id=$2 AND r.stars>=4', [ws, of])).rows[0].n as number;
    }, user);
    const trades = (await c.db.query(`SELECT coalesce(o.trade,'general') AS trade,count(*)::int AS count ${base} AND ${month}=${current} GROUP BY coalesce(o.trade,'general') ORDER BY count(*) DESC,trade`, [ws, of])).rows as { trade: string; count: number }[];
    const filter = `${base} AND ($3='all' OR ${month}=${current} - CASE WHEN $3='last' THEN interval '1 month' ELSE interval '0 month' END)
      AND ($4='' OR strpos(lower(concat_ws(' ',o.title,s.name,o.report_problem,o.report_work)),lower($4))>0)`;
    const args = [ws, of, d.month, d.q];
    const total = (await c.db.query(`SELECT count(*)::int AS n ${filter}`, args)).rows[0].n as number;
    const data = (await c.db.query(`SELECT o.id,o.order_number,o.title,s.name AS site_name,coalesce(o.report_at,o.updated_at) AS done_at,
      (coalesce(o.report_at,o.updated_at) AT TIME ZONE w.timezone)::date::text AS done_date,
      o.report_problem AS problem,o.report_work AS fix,o.report_outcome,o.trade ${filter}
      ORDER BY coalesce(o.report_at,o.updated_at) DESC,o.id DESC LIMIT 20 OFFSET $5`, [...args, (d.page - 1) * 20])).rows.map(r => ({ ...r, outcome_label: r.report_outcome ? OUTCOME_LABELS[r.report_outcome as typeof OUTCOMES[number]] : 'Done' }));
    return { summary: { ...summary, thanks, trades }, data, total, page: d.page, pageSize: 20 };
  });
}
