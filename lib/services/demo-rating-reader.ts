import type { PoolClient } from 'pg';

// Caller must first authorize the viewer and job through inWorkspace. This
// reader stays inside a live sandbox and is used only for high-rating reads.
export async function useDemoRatingReader(db: PoolClient, ws: string, user: string) {
  const reader = (await db.query(`SELECT m.user_id FROM workspaces w
    JOIN users u ON u.id=$2 AND u.is_demo AND u.demo_workspace_id=w.id
    JOIN members m ON m.workspace_id=w.id AND m.role='admin' AND m.archived_at IS NULL
    WHERE w.id=$1 AND w.is_demo AND w.demo_expires_at>now() LIMIT 1`, [ws, user])).rows[0];
  if (!reader) return false;
  await db.query("SELECT set_config('app.user_id',$1,true)", [reader.user_id]);
  return true;
}
