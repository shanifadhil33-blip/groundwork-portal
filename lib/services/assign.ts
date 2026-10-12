import { z } from 'zod';
import { TRADES } from '../trades';
import { withSystem } from '../db';
import { ApiError } from '../http';
import { allow, inWorkspace, row } from './shared';
import { assertRealUser } from './demo';

const skillsSchema = z.object({
  trades: z.array(z.enum(TRADES)).max(7),
  areas: z.array(z.string().trim().min(1).max(120)).max(30),
}).strict();

/** Admin or supervisor sets what a worker does and where. Supervisors may set technicians only. */
export async function setWorkerSkills(user: string, ws: string, workerId: string, body: unknown) {
  await assertRealUser(user);
  const data = skillsSchema.parse(body);
  const trades = [...new Set(data.trades)], areas = [...new Set(data.areas)];
  await inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const m = (await c.db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2', [ws, workerId])).rows[0];
    if (!m || m.role === 'client') throw new ApiError(404, 'not_found', 'This person is not on your team.');
    if (c.role === 'staff' && m.role !== 'technician') throw new ApiError(403, 'forbidden', 'Ask an admin to change this person.');
  });
  return withSystem(async db => (await db.query('UPDATE members SET trades=$3, areas=$4 WHERE workspace_id=$1 AND user_id=$2 RETURNING user_id, trades, areas', [ws, workerId, trades, areas])).rows[0], user);
}

/** Areas used by this workspace's sites, for the area picker. */
export async function workspaceAreas(user: string, ws: string) {
  return inWorkspace(user, ws, async c => { allow(c, ['admin', 'staff']); return (await c.db.query("SELECT DISTINCT area FROM sites WHERE workspace_id=$1 AND area IS NOT NULL ORDER BY area", [ws])).rows.map(r => r.area as string); });
}

/** Best workers for one job: right trade first, then right area, then fewest jobs today. */
export async function suggestWorkers(user: string, ws: string, workOrderId: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const job = await row(c, 'work_orders', workOrderId);
    const site = await row(c, 'sites', job.site_id);
    const tz = (await c.db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0]?.timezone ?? 'Asia/Dubai';
    const rows = (await c.db.query(
      `SELECT m.user_id, m.role, u.name, m.trades, m.areas,
        ($2::text IS NOT NULL AND $2 = ANY(m.trades)) AS trade_match,
        ($3::text IS NOT NULL AND $3 = ANY(m.areas)) AS area_match,
        (SELECT count(*)::int FROM work_orders w WHERE w.workspace_id=m.workspace_id AND w.assignee_id=m.user_id AND w.status NOT IN ('done','cancelled') AND (w.scheduled_for AT TIME ZONE $4)::date=(now() AT TIME ZONE $4)::date) AS today
       FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true
       WHERE m.workspace_id=$1 AND m.role IN ('technician','staff')`, [ws, job.trade ?? null, site.area ?? null, tz])).rows;
    rows.sort((a, b) => Number(b.trade_match) - Number(a.trade_match) || Number(b.area_match) - Number(a.area_match) || (a.role === 'technician' ? 0 : 1) - (b.role === 'technician' ? 0 : 1) || a.today - b.today || String(a.name).localeCompare(String(b.name)));
    return { trade: job.trade ?? null, area: site.area ?? null, workers: rows };
  });
}
