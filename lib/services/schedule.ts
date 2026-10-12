import { z } from 'zod';
import { allow, inWorkspace } from './shared';

const q = z.object({ from: z.iso.date(), days: z.coerce.number().int().min(1).max(14).default(7) });

/** The schedule board: who does what on which day, plus active jobs with no visit yet. Office only. */
export async function scheduleBoard(user: string, ws: string, params: URLSearchParams) {
  const { from, days } = q.parse({ from: params.get('from') ?? undefined, days: params.get('days') ?? undefined });
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const tz = (await c.db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0].timezone as string;
    const e = new Date(from + 'T12:00:00Z'); e.setUTCDate(e.getUTCDate() + days - 1); const end = e.toISOString().slice(0, 10);
    const people = (await c.db.query(`SELECT m.user_id, m.role, u.name, m.trades FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true
      WHERE m.workspace_id=$1 AND m.role IN ('technician','staff','admin') ORDER BY CASE m.role WHEN 'technician' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, u.name`, [ws])).rows;
    const cols = `w.id, w.order_number, w.title, w.status, w.priority, w.trade, w.assignee_id, w.scheduled_for, w.due_on, w.updated_at, s.name AS site_name, s.area`;
    const jobs = (await c.db.query(`SELECT ${cols}, (w.scheduled_for AT TIME ZONE $4)::date::text AS day, extract(hour FROM w.scheduled_for AT TIME ZONE $4)::int AS hour
      FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
      WHERE w.workspace_id=$1 AND w.status <> 'cancelled' AND (w.scheduled_for AT TIME ZONE $4)::date BETWEEN $2::date AND $3::date
      ORDER BY w.scheduled_for, w.order_number`, [ws, from, end, tz])).rows;
    const unscheduled = (await c.db.query(`SELECT ${cols} FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
      WHERE w.workspace_id=$1 AND w.scheduled_for IS NULL AND w.status NOT IN ('done','cancelled') ORDER BY w.due_on NULLS LAST, w.order_number LIMIT 50`, [ws])).rows;
    return { timezone: tz, from, days, people, jobs, unscheduled };
  });
}
