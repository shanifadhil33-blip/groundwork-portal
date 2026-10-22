import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { CHECKLIST_DEFAULTS, emptyChecklist } from './job-checklists';
import { TRADES } from './trades';
/** Shared by both demo companies. Seed every job type and real filled job snapshots. */
export async function populateChecklistFixture(db:PoolClient, ws:string, actor:string) {
  const templates=Object.fromEntries(TRADES.map(trade=>[trade,CHECKLIST_DEFAULTS[trade]??['Test the repair','Clean the work area']]));
  await db.query("UPDATE workspaces SET working_hours=jsonb_set(working_hours,'{checklists}',$2::jsonb) WHERE id=$1",[ws,JSON.stringify(templates)]);
  const jobs=(await db.query("SELECT id,client_id,trade,status FROM work_orders WHERE workspace_id=$1 AND archived_at IS NULL ORDER BY (status='in_progress') DESC,(status='done') DESC,order_number LIMIT 8",[ws])).rows;
  for(const [index,job] of jobs.entries()){
    const state=emptyChecklist(templates[job.trade]??templates.general);
    state.steps.forEach((step,n)=>{step.done=job.status==='done'||n<2;});
    state.materials=[{id:randomUUID(),name:job.trade==='ac'?'Capacitor':job.trade==='plumbing'?'Washer':'Cable clip',quantity:index%2+1,note:'Used during the visit'}];
    await db.query("INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details) VALUES($1,$2,$3,$4,'job_checklist','Checklist and materials saved.',$5)",[ws,job.client_id,job.id,actor,JSON.stringify(state)]);
  }
}
