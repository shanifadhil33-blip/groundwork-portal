import { overdueSql, todaySql } from '../dates';
import { ApiError } from '../http';
import { inWorkspace } from './shared';

const cols = `w.id, w.order_number, w.title, w.status, w.priority, w.trade, w.scheduled_for, w.due_on, w.updated_at,
  s.name AS site_name, s.address, s.building, s.area, s.access_notes, s.contact_name, s.contact_phone`;
const from = 'FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id';
// The date helpers name the table work_orders; here it is aliased w.
const sql = (s: string) => s.replaceAll('work_orders.workspace_id', 'w.workspace_id').replace(/\b(scheduled_for|status|due_on)\b/g, 'w.$1');

/** "My jobs today" for the signed in worker: today in time order, late ones, the next few days, and what is done today. */
export async function myDay(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    if (c.role === 'client') throw new ApiError(403, 'forbidden', 'This page is for the team.');
    const tz = (await c.db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0].timezone as string;
    const q = async (where: string, order: string, limit = 50) => (await c.db.query(`SELECT ${cols} ${from} WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND ${where} ORDER BY ${order} LIMIT ${limit}`, [ws, user])).rows;
    const today = await q(sql(todaySql), 'w.scheduled_for, w.order_number');
    const late = (await q(sql(overdueSql), 'w.due_on, w.order_number')).filter(j => !today.some(t => t.id === j.id));
    const next = await q(`w.status NOT IN ('done','cancelled') AND (w.scheduled_for AT TIME ZONE '${tz.replace(/'/g, "''")}')::date > (now() AT TIME ZONE '${tz.replace(/'/g, "''")}')::date`, 'w.scheduled_for', 5);
    // Done today = moved to Done today (from the job history), not merely edited today.
    const done = (await c.db.query(`SELECT count(*)::int n FROM work_orders w WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND w.status='done' AND EXISTS (SELECT 1 FROM work_order_events e WHERE e.workspace_id=w.workspace_id AND e.work_order_id=w.id AND e.kind='status_changed' AND e.details->>'to_status'='done' AND (e.created_at AT TIME ZONE $3)::date=(now() AT TIME ZONE $3)::date)`, [ws, user, tz])).rows[0].n as number;
    return { timezone: tz, today, late, next, done };
  });
}
