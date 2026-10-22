import { withSystem } from '../db';

// Owner reads must authorize the caller in SQL and retain him as the actor.
// Both detail and count use the same scope, including sandbox expiry.
const scope = `FROM job_ratings r
  JOIN work_orders j ON j.id=r.work_order_id AND j.workspace_id=r.workspace_id
  JOIN workspaces w ON w.id=j.workspace_id
  JOIN members m ON m.workspace_id=w.id AND m.user_id=$2
    AND m.role='technician' AND m.archived_at IS NULL
  JOIN users u ON u.id=m.user_id
  WHERE w.id=$1 AND j.assignee_id=$2 AND r.stars>=4
    AND (NOT w.is_demo AND NOT u.is_demo OR
      w.is_demo AND u.is_demo AND u.demo_workspace_id=w.id AND w.demo_expires_at>now())`;

export async function technicianRating(user: string, ws: string, id: string) {
  return withSystem(async db => (await db.query(
    `SELECT r.stars,r.note,r.created_at ${scope} AND j.id=$3`, [ws, user, id]
  )).rows[0] ?? null, user);
}

export async function technicianThanks(user: string, ws: string) {
  return withSystem(async db => (await db.query(
    `SELECT count(*)::int AS n ${scope}`, [ws, user]
  )).rows[0].n as number, user);
}
