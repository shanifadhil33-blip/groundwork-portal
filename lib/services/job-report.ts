import { z } from 'zod';
import { ApiError } from '../http';
import { withSystem } from '../db';
import { allow, inWorkspace, row } from './shared';
import { patchWorkOrder } from './work-orders';

export const OUTCOMES = ['fixed', 'temporary', 'needs_part', 'cant_fix'] as const;
export const OUTCOME_LABELS: Record<(typeof OUTCOMES)[number], string> = { fixed: 'Fixed', temporary: 'Temporary fix', needs_part: 'Needs a part', cant_fix: "Can't be fixed" };
const reportSchema = z.object({ problem: z.string().trim().max(2000).default(''), work: z.string().trim().max(2000).default(''), outcome: z.enum(OUTCOMES).default('fixed'), updated_at: z.string() }).strict();
/** Where the job goes next. Fixed and Temporary fix close the visit; Needs a part waits for parts; Can't be fixed stays open for the supervisor. */
const nextStatus = { fixed: 'done', temporary: 'done', needs_part: 'waiting_on_parts', cant_fix: null } as const;

/** The technician's job report, in his own words. Nothing is required: an empty report still closes the job as Fixed. */
export async function saveJobReport(user: string, ws: string, id: string, body: unknown) {
  const data = reportSchema.parse(body);
  const order = await inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    const o = await row(c, 'work_orders', id, true);
    if (c.role === 'technician' && o.assignee_id !== user) throw new ApiError(403, 'forbidden', 'This job is not yours.');
    if (o.status === 'done' || o.status === 'cancelled') throw new ApiError(409, 'closed', 'This job is already closed.');
    return { status: o.status, updated_at: o.updated_at };
  });
  // Permission is checked above. The write runs on the owner connection because technicians may only change a job's status column directly.
  const after = await withSystem(async db => (await db.query('UPDATE work_orders SET report_problem=$3, report_work=$4, report_outcome=$5, report_at=now(), report_by=$6 WHERE workspace_id=$1 AND id=$2 RETURNING status, updated_at', [ws, id, data.problem || null, data.work || null, data.outcome, user])).rows[0], user);
  const target = nextStatus[data.outcome];
  // Walk the normal status path so history, notifications and push all stay correct.
  let current = after ?? order;
  const path: string[] = target === 'done' ? (current.status === 'open' ? ['scheduled', 'in_progress', 'done'] : current.status === 'scheduled' ? ['in_progress', 'done'] : ['done'])
    : target === 'waiting_on_parts' ? (current.status === 'open' ? ['scheduled', 'in_progress', 'waiting_on_parts'] : current.status === 'scheduled' ? ['in_progress', 'waiting_on_parts'] : current.status === 'waiting_on_parts' ? [] : ['waiting_on_parts']) : [];
  for (const status of path) current = await patchWorkOrder(user, ws, id, { status, updated_at: new Date(current.updated_at).toISOString() }) as typeof current;
  return { status: current.status, outcome: data.outcome, record: await jobRecord(user, ws, user) };
}

/** Jobs a person finished: this month and in total. Office can read anyone on the team; a technician reads his own. */
export async function jobRecord(user: string, ws: string, of: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff', 'technician']);
    if (c.role === 'technician' && of !== user) throw new ApiError(403, 'forbidden', 'You can see your own record.');
    return (await c.db.query(`SELECT count(*) FILTER (WHERE date_trunc('month', coalesce(report_at, updated_at) AT TIME ZONE w.timezone) = date_trunc('month', now() AT TIME ZONE w.timezone))::int AS month, count(*)::int AS total
      FROM work_orders o JOIN workspaces w ON w.id=o.workspace_id WHERE o.workspace_id=$1 AND o.assignee_id=$2 AND o.status='done'`, [ws, of])).rows[0] as { month: number; total: number };
  });
}
