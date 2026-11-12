import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { scheduledInstant } from './dates';
import { fixturePhotos } from './fixture-photos';

// D1: called only while creating a sandbox, including resets. Never use service
// writes here: signing off or rating through them may deliver notifications.
export async function populateProofFixture(db: PoolClient, ids: typeof fixtureIds, siteId: (n: number) => string, orderId: (n: number) => string, today: string, timezone: string) {
  const day = (offset: number) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const at = (offset: number, hour: number) => scheduledInstant(day(offset), timezone, hour)!;
  const problem = 'The tap was leaking.';
  const work = 'Replaced the seal and tested the tap.';
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);

  // Existing Harbor tap job: Ravi's report, Pranav's sign off and thanks.
  const harborJob = orderId(18);
  await db.query(`UPDATE work_orders SET title='Fix the leaking pantry tap',description='The pantry tap drips all day.',trade='plumbing',
    assignee_id=$2,report_by=$2,report_problem=$3,report_work=$4,report_outcome='fixed',
    created_at=$5,scheduled_for=$6,report_at=$7,updated_at=$7,due_on=$8,
    quote_status='approved',quote_amount=320,quote_note=$4,payment_status='paid',
    signed_off_at=$9,signed_off_by=$10 WHERE id=$1`,
  [harborJob, ids.ravi, problem, work, at(-4, 8), at(-3, 9), at(-3, 10), day(-3), at(-2, 11), ids.pranav]);

  // A new household request, with its own creator and site. No historic job
  // belonging to another resident is reassigned to make it visible to Faisal.
  const householdJob = (await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,description,status,priority,
    source,trade,created_by,assignee_id,order_number,created_at,scheduled_for,due_on,report_by,report_at,report_problem,report_work,
    report_outcome,quote_status,quote_amount,quote_note,updated_at)
    VALUES($1,$2,$3,'Fix the leaking pantry tap','The pantry tap drips all day.','done','normal','client','plumbing',$4,$5,61,$6,$7,$8,$5,$9,$10,$11,
      'fixed','approved',320,$11,$9) RETURNING id`,
  [ids.ridgeline, ids.northgate, siteId(4), ids.faisal, ids.ravi, at(-4, 8), at(-2, 9), day(-2), at(-2, 10), problem, work])).rows[0].id as string;

  for (const [job, company, offset] of [[harborJob, ids.harbor, -3], [householdJob, ids.northgate, -2]] as const) {
    for (const kind of ['before', 'after'] as const) {
      await db.query(`INSERT INTO job_photos(workspace_id,client_id,work_order_id,kind,mime,bytes,width,height,taken_by,created_at)
        VALUES($1,$2,$3,$4,'image/webp',$5,256,160,$6,$7)`,
      [ids.ridgeline, company, job, kind, fixturePhotos[kind], ids.ravi, at(offset, kind === 'before' ? 9 : 10)]);
    }
  }
  const shared = (await db.query(`INSERT INTO shared_photos(workspace_id,uploaded_by,mime,bytes,width,height,created_at)
    VALUES($1,$2,'image/webp',$3,256,160,$4) RETURNING id`, [ids.ridgeline, ids.faisal, fixturePhotos.before, at(-4, 8)])).rows[0].id;
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.faisal]);
  await db.query(`INSERT INTO comments(workspace_id,client_id,work_order_id,body,visibility,author_id,author_name,photo_ids,created_at)
    VALUES($1,$2,$3,'The pantry tap drips all day.','client',$4,'Faisal',$5,$6)`,
  [ids.ridgeline, ids.northgate, householdJob, ids.faisal, JSON.stringify([shared]), at(-4, 8)]);
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);

  // The low rating belongs to Omar's Northgate pump job. Household filtering
  // keeps it away from Faisal, while the ordinary supervisor privacy rules apply.
  const lowJob = orderId(24);
  await db.query(`UPDATE work_orders SET assignee_id=$2,report_by=$2,created_at=$3,scheduled_for=$4,
    report_at=$5,due_on=$6,signed_off_at=$7,signed_off_by=$8 WHERE id=$1`,
  [lowJob, ids.ravi, at(-5, 8), at(-3, 11), at(-3, 12), day(-3), at(-1, 11), ids.omar]);
  // Keep the sample timelines in step with the dated visits and reports above.
  for (const job of [harborJob, lowJob, householdJob]) {
    await db.query('DELETE FROM work_order_events WHERE workspace_id=$1 AND work_order_id=$2', [ids.ridgeline, job]);
    await db.query(`INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at)
      SELECT workspace_id,client_id,id,created_by,'created','Request created','{}'::jsonb,created_at FROM work_orders WHERE id=$1
      UNION ALL SELECT workspace_id,client_id,id,$2,'status_changed','Status updated','{"from_status":"open","to_status":"scheduled"}',scheduled_for-interval '1 day' FROM work_orders WHERE id=$1
      UNION ALL SELECT workspace_id,client_id,id,$3,'status_changed','Status updated','{"from_status":"scheduled","to_status":"in_progress"}',scheduled_for FROM work_orders WHERE id=$1
      UNION ALL SELECT workspace_id,client_id,id,$3,'status_changed','Status updated','{"from_status":"in_progress","to_status":"done"}',report_at FROM work_orders WHERE id=$1`, [job, ids.sam, ids.ravi]);
  }
  await db.query('UPDATE comments SET created_at=$2 WHERE work_order_id=$1', [harborJob, at(-4, 10)]);
  for (const [company, job, actor, stars, note, when] of [
    [ids.harbor, harborJob, ids.pranav, 5, 'Thank you for fixing the tap.', at(-2, 11)],
    [ids.northgate, lowJob, ids.omar, 2, 'Please check this repair again.', at(-1, 11)],
  ] as const) {
    // Ratings use the client's existing insert policy, including in owner seeds.
    await db.query("SELECT set_config('app.user_id',$1,true)", [actor]);
    await db.query(`INSERT INTO job_ratings(workspace_id,client_id,work_order_id,rated_by,stars,note,created_at)
      VALUES($1,$2,$3,$4,$5,$6,$7)`, [ids.ridgeline, company, job, actor, stars, note, when]);
  }
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);
}
