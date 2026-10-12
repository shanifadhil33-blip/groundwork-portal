import { allow, inWorkspace } from './shared';
import { withSystem } from '../db';

/** Team today: workers only (not clients), with what each one has to do today. */
export async function teamToday(user: string, ws: string) {
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const tz = (await c.db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0]?.timezone ?? 'Asia/Dubai';
    const rows = (await c.db.query(
      `SELECT m.user_id, m.role, u.name, u.email, m.trades, m.areas,
        count(w.id) FILTER (WHERE w.status NOT IN ('done','cancelled'))::int AS open,
        count(w.id) FILTER (WHERE w.status NOT IN ('done','cancelled') AND (w.scheduled_for AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date)::int AS today,
        count(w.id) FILTER (WHERE w.status NOT IN ('done','cancelled') AND w.due_on < (now() AT TIME ZONE $2)::date)::int AS late
       FROM members m LEFT JOIN LATERAL visible_user(m.user_id) u ON true
       LEFT JOIN work_orders w ON w.workspace_id = m.workspace_id AND w.assignee_id = m.user_id
       WHERE m.workspace_id = $1 AND m.role <> 'client'
       GROUP BY m.user_id, m.role, u.name, u.email, m.trades, m.areas
       ORDER BY CASE m.role WHEN 'technician' THEN 0 WHEN 'staff' THEN 1 ELSE 2 END, u.name`, [ws, tz])).rows;
    return rows;
  }).then(async rows => {
    // Phones are not exposed by visible_user, so read them for this workspace's members only, after the role check above.
    const phones = rows.length ? (await withSystem(db => db.query('SELECT u.id AS user_id, u.phone FROM users u JOIN members m ON m.user_id=u.id AND m.workspace_id=$1 WHERE u.phone IS NOT NULL', [ws]), user)).rows as { user_id: string; phone: string }[] : [];
    const phoneOf = new Map(phones.map(p => [p.user_id, p.phone]));
    return rows.map(r => ({ ...r, phone: phoneOf.get(r.user_id) ?? null, signs_in_with: r.email ? 'google' : 'code' }));
  });
}
