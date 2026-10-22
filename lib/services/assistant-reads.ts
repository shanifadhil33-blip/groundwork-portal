import { overdueSql } from '../dates';
import { inWorkspace } from './shared';

/** Week starts Monday in workspace time. Every aggregate remains under the viewer's RLS. */
export async function assistantWeek(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>(await c.db.query(`
  WITH bounds AS (SELECT date_trunc('week',now() AT TIME ZONE timezone) AT TIME ZONE timezone AS start FROM workspaces WHERE id=$1)
  SELECT count(*) FILTER (WHERE created_at >= bounds.start)::int AS new,
   count(*) FILTER (WHERE status='done' AND EXISTS (
    SELECT 1 FROM audit_log a WHERE a.workspace_id=$1 AND a.entity='work_orders' AND a.entity_id=work_orders.id
     AND a.at >= bounds.start AND a.at <= now() AND a.after->>'status'='done' AND a.before->>'status' IS DISTINCT FROM 'done'
   ))::int AS done,
   count(*) FILTER (WHERE status NOT IN ('done','cancelled'))::int AS open,
   count(*) FILTER (WHERE ${overdueSql})::int AS late
  FROM work_orders CROSS JOIN bounds WHERE workspace_id=$1 AND archived_at IS NULL`,[ws])).rows[0] as {new:number;done:number;open:number;late:number});
}
