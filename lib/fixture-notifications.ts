import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { notificationTemplates } from './ui/notifications';

/** G2: deterministic local notices on creation and reset. Production cron never scans these workspaces. */
export async function populateNotificationFixture(db: PoolClient, ids: typeof fixtureIds) {
  // The fixture connection is already the owner. Clear attribution for system notices,
  // then restore it; never impersonate a recipient to read or write his rows.
  const actor = (await db.query("SELECT current_setting('app.user_id',true) AS id")).rows[0].id;
  await db.query("SELECT set_config('app.user_id','',true)");
  const examples = (await db.query(`SELECT id,title,client_id,site_id,trade FROM work_orders
    WHERE workspace_id=$1 AND assignee_id=$2 AND status IN ('scheduled','in_progress')
      AND archived_at IS NULL ORDER BY order_number LIMIT 2`, [ids.ridgeline, ids.ravi])).rows;
  for (const [index, example] of examples.entries()) {
    const kind = index === 0 ? 'demo_late' : 'demo_stalled';
    // Insert dated examples: the ordinary update trigger deliberately prevents backdating.
    const job = (await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,trade,status,assignee_id,
      created_by,order_number,created_at,updated_at,scheduled_for,due_on)
      SELECT $1,$2,$3,$4,$5,'scheduled',$6,$7,coalesce(max(order_number),0)+1,
        now()-interval '5 days',CASE WHEN $8::int=-1 THEN now()-interval '1 day' ELSE now()-interval '3 days 1 hour' END,now()-interval '4 days',
        (now() AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$1))::date + $8::int
      FROM work_orders WHERE workspace_id=$1 RETURNING id,title,assignee_id`,
    [ids.ridgeline,example.client_id,example.site_id,example.title,example.trade,ids.ravi,ids.sam,index===0?-1:1])).rows[0];
    await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,work_order_title,job_step_body)
      SELECT user_id,$1,$2,'work_orders',$3,$4,$5 FROM members
      WHERE workspace_id=$1 AND archived_at IS NULL AND (role IN ('admin','staff') OR ($2='demo_late' AND user_id=$6))`,
    [ids.ridgeline,kind,job.id,job.title,notificationTemplates[kind],job.assignee_id]);
  }
  await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,work_order_title,job_step_body,to_status)
    SELECT m.user_id,d.workspace_id,'demo_document','documents',d.id,d.title,$2,'7'
    FROM company_documents d JOIN members m ON m.workspace_id=d.workspace_id
    JOIN workspaces s ON s.id=d.workspace_id
    WHERE d.workspace_id=$1 AND d.archived_at IS NULL AND m.archived_at IS NULL
      AND d.expires_on-(now() AT TIME ZONE s.timezone)::date=7
      AND m.role IN ('admin','staff')`, [ids.ridgeline,notificationTemplates.demo_document]);
  // The completed Harbor request already has a coherent Ravi report and Pranav as client.
  // Rehearse its booked, travel and done notices without any external delivery.
  const done = (await db.query(`SELECT id,title,scheduled_for,report_at FROM work_orders
    WHERE workspace_id=$1 AND signed_off_by=$2 AND assignee_id=$3 AND status='done'
      AND report_at IS NOT NULL ORDER BY order_number LIMIT 1`, [ids.ridgeline,ids.pranav,ids.ravi])).rows[0];
  if (done) for (const [kind,from,to,at,who,name] of [
    ['status_changed','open','scheduled',new Date(new Date(done.scheduled_for).getTime()-86400000),ids.sam,'Sam'],
    ['on_the_way',null,null,new Date(new Date(done.scheduled_for).getTime()-1800000),ids.ravi,'Ravi'],
    ['status_changed','in_progress','done',done.report_at,ids.ravi,'Ravi'],
  ]) await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,from_status,to_status,created_at)
    VALUES($1,$2,$3,'work_orders',$4,$5,$10,$6,$7,$8,$9)`,
    [ids.pranav,ids.ridgeline,kind,done.id,who,done.title,from,to,at,name]);
  await db.query("SELECT set_config('app.user_id',$1,true)", [actor ?? '']);
}
