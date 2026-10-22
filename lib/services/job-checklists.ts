import { assertPriceReleased } from './price-changes';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { withSystem } from '../db';
import { ApiError } from '../http';
import { templateInput, progressInput, emptyChecklist, type JobChecklist } from '../job-checklists';
import { allowTeam, inWorkspace, row, uuid, replay } from './shared';

/** Existing company JSON keeps its hours and other settings. Templates have their own namespace. */
export async function checklistTemplates(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    allowTeam(c);
    return withSystem(async db => (await db.query('SELECT working_hours FROM workspaces WHERE id=$1', [ws])).rows[0]?.working_hours?.checklists ?? {}, user) as Promise<Record<string, string[]>>;
  });
}
export async function saveChecklistTemplate(user: string, ws: string, body: unknown) {
  const data = templateInput.parse(body);
  return inWorkspace(user, ws, async c => {
    allowTeam(c);
    // Supervisor writes are narrowly authorized here because workspace RLS only permits admins.
    return withSystem(async db => {
      const m = (await db.query('SELECT role,staff_kind FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws,user])).rows[0];
      if (!m || !['admin','staff'].includes(m.role) || m.staff_kind === 'office') throw new ApiError(403,'forbidden','You cannot change checklists.');
      await db.query("UPDATE workspaces SET working_hours=jsonb_set(working_hours,'{checklists}',coalesce(working_hours->'checklists','{}'::jsonb) || jsonb_build_object($2::text,$3::jsonb)) WHERE id=$1", [ws,data.trade,JSON.stringify(data.steps)]);
      return data;
    }, user);
  });
}
async function onJob(db: PoolClient, ws: string, job: {id:string;trade:string|null}): Promise<JobChecklist> {
  const saved = (await db.query("SELECT details FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2 AND kind='job_checklist' ORDER BY created_at DESC,id DESC LIMIT 1", [ws,job.id])).rows[0];
  if (saved) return saved.details as JobChecklist;
  const company = (await db.query('SELECT working_hours FROM workspaces WHERE id=$1',[ws])).rows[0];
  return emptyChecklist(company?.working_hours?.checklists?.[job.trade ?? 'general'] ?? []);
}
export async function jobChecklist(user: string, ws: string, id: string) {
  return inWorkspace(user,ws,async c => {
    const job = await row(c,'work_orders',id);
    const data = await onJob(c.db,ws,job);
    return { ...data, editable: job.status !== 'done' && job.status !== 'cancelled' && (c.role === 'admin' || (c.role === 'staff' && c.staff_kind !== 'office') || (c.role === 'technician' && job.assignee_id === user)) };
  });
}
/** Lock the job across ticks, materials and report closure. Keep immutable snapshots in its existing event JSON. */
export async function saveJobChecklist(user: string, ws: string, id: string, body: unknown, key?: string) {
  uuid.parse(ws); uuid.parse(id);
  const data = progressInput.parse(body);
  return withSystem(async db => {
    const m = (await db.query('SELECT role,staff_kind FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL',[ws,user])).rows[0];
    if (!m || !['admin','staff','technician'].includes(m.role) || m.staff_kind === 'office') throw new ApiError(403,'forbidden','You cannot change this job.');
    const job = (await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,id])).rows[0];
    if (!job || (m.role === 'technician' && job.assignee_id !== user)) throw new ApiError(403,'forbidden','This job is not yours.');
    return replay(db,user,ws+'/work-orders/'+id+'/checklist',key,data,async () => {
      if (['done','cancelled'].includes(job.status)) throw new ApiError(409,'closed','This job is already closed.');
      await assertPriceReleased(db,ws,id);
      const state = await onJob(db,ws,job);
      if (data.action === 'tick') {
        const step = state.steps.find(s => s.name === data.step);
        if (!step) throw new ApiError(422,'invalid','Open the job and choose a checklist step.');
        step.done = data.done;
      } else if (data.action === 'add_material') {
        if (state.materials.length >= 30) throw new ApiError(422,'invalid','Use up to thirty materials.');
        state.materials.push({id:randomUUID(),name:data.name,quantity:data.quantity,...(data.note ? {note:data.note} : {})});
      } else state.materials = state.materials.filter(m => m.id !== data.material_id);
      await db.query("INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at) VALUES($1,$2,$3,$4,'job_checklist','Checklist and materials saved.',$5,clock_timestamp())",[ws,job.client_id,id,user,JSON.stringify(state)]);
      return {...state,editable:true};
    });
  },user);
}
