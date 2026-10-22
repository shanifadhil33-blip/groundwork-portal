import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { scheduledInstant } from './dates';

/** D3: new sandboxes and resets only. Direct fixture writes never call delivery services. */
export async function populateFollowUpFixture(db: PoolClient, ids: typeof fixtureIds, siteId: (n: number) => string, today: string, timezone: string) {
  const day = (offset: number) => new Date(Date.parse(`${today}T12:00:00Z`) + offset * 86400000).toISOString().slice(0, 10);
  const at = (offset: number, hour: number) => scheduledInstant(day(offset), timezone, hour)!;
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);

  // Dedicated examples preserve existing jobs and household history. Both parts
  // reports name the needed part; no work or price is inferred from report prose.
  const jobs: string[] = [];
  for (const n of [62, 63, 64, 65, 66]) {
    const home = n === 65, follow = n === 64, fixed = n === 66;
    const status = fixed ? 'done' : home ? 'scheduled' : 'waiting_on_parts';
    const title = follow ? 'Follow up: Sample tap repair' : 'Sample tap repair';
    const job = (await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,description,trade,status,priority,source,
      created_by,assignee_id,preferred_technician_id,order_number,created_at,scheduled_for,due_on,
      report_by,report_at,report_problem,report_work,report_part,report_outcome,follow_up_of)
      VALUES($1,$2,$3,$4,'Sample drawings','plumbing',$5,'normal','client',$6,$7,$7,$8,$9,$10,$11,
        $12,$13,$14,$15,$16,$17,$18) RETURNING id`,
    [ids.ridgeline, home ? ids.northgate : ids.harbor, siteId(home ? 4 : 1), title, status,
      home ? ids.faisal : ids.pranav, ids.ravi, n, at(follow ? -2 : -5, 8), follow ? null : at(-3, 9), day(follow ? 7 : -3),
      home || follow ? null : ids.ravi, home || follow ? null : at(-3, 10), home || follow ? null : 'The tap was leaking.',
      fixed ? 'Replaced the seal and tested the tap.' : null, home ? null : 'Seal',
      fixed ? 'fixed' : home || follow ? null : 'needs_part', follow ? jobs[1] : null])).rows[0].id as string;
    jobs.push(job);
    await db.query(`INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,created_at)
      SELECT workspace_id,client_id,id,created_by,'created','Request created',created_at FROM work_orders WHERE id=$1`, [job]);
    if (!follow) {
      const stages = home ? ['scheduled'] : ['scheduled', 'in_progress', status];
      for (const [index, stage] of stages.entries()) {
        await db.query(`INSERT INTO work_order_events(workspace_id,client_id,work_order_id,actor_id,kind,body,details,created_at)
          SELECT workspace_id,client_id,id,$2,'status_changed','Status updated',$3::jsonb,$4 FROM work_orders WHERE id=$1`,
        [job, index === 0 ? ids.sam : ids.ravi, JSON.stringify({ from_status: stages[index - 1] ?? 'open', to_status: stage }),
          index === 0 ? at(-4, 11) : at(-3, index === 1 ? 9 : 10)]);
      }
    }
  }
  // Match reportNextNotice and the ordinary approval links without running a
  // service that could notify anyone. Only the second suggestion is approved.
  for (const [index, source] of jobs.slice(0, 2).entries()) {
    await db.query(`INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,
      from_work_order_id,report_follow_up_of,title,problem,priority,preferred_technician_id,
      status,work_order_id,decided_by,created_at,decided_at)
      VALUES($1,'agent',$2,'Ravi',$3,$4,$5,$5,'Follow up: Sample tap repair','Seal','normal',$2,$6,$7,$8,$9,$10)`,
    [ids.ridgeline, ids.ravi, ids.harbor, siteId(1), source, index === 0 ? 'pending' : 'approved',
      index === 0 ? null : jobs[2], index === 0 ? null : ids.sam, at(-3, 10), index === 0 ? null : at(-2, 8)]);
  }
  // Faisal owns this request. A skipped entrance photo is a supported visit,
  // and the original appointment stays until he confirms a new free time.
  await db.query(`INSERT INTO job_visits(workspace_id,work_order_id,technician_id,visited_at)
    VALUES($1,$2,$3,$4)`, [ids.ridgeline, jobs[3], ids.ravi, at(-3, 9)]);
  // The Fixed example stays unsigned. Normal sign off generates the SAMPLE
  // Visit + Seal draft (150 + 40), which only the owner can keep. Nothing is sent.
}
