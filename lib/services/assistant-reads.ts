import { overdueSql } from '../dates';
import { inWorkspace } from './shared';

/** Week starts Monday in workspace time. Completion dates match My record (report time, then legacy update time).
 * Aggregate visible jobs directly; audit RLS intentionally hides other people's actions from most roles. */
export async function assistantWeek(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>(await c.db.query(`
  WITH bounds AS (SELECT date_trunc('week',now() AT TIME ZONE timezone) AT TIME ZONE timezone AS start FROM workspaces WHERE id=$1)
  SELECT count(*) FILTER (WHERE created_at >= bounds.start)::int AS new,
   count(*) FILTER (WHERE status='done' AND coalesce(report_at,updated_at) >= bounds.start AND coalesce(report_at,updated_at) <= now())::int AS done,
   count(*) FILTER (WHERE status NOT IN ('done','cancelled'))::int AS open,
   count(*) FILTER (WHERE ${overdueSql})::int AS late
  FROM work_orders CROSS JOIN bounds WHERE workspace_id=$1 AND archived_at IS NULL`,[ws])).rows[0] as {new:number;done:number;open:number;late:number});
}

/** Aggregate every visible active job before limiting output. RLS supplies the caller's scope.
 * Sort busiest first so bounded model snapshots retain the answer and ties. */
export async function assistantWorkload(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>(await c.db.query(`
  SELECT w.assignee_id, u.name, count(*)::int AS open
  FROM work_orders w LEFT JOIN LATERAL visible_user(w.assignee_id) u ON true
  WHERE w.workspace_id=$1 AND w.archived_at IS NULL AND w.status NOT IN ('done','cancelled')
  GROUP BY w.assignee_id,u.name ORDER BY open DESC,w.assignee_id NULLS LAST`,[ws])).rows as {assignee_id:string|null;name:string|null;open:number}[]);
}
