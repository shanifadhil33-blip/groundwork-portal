import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { DEMO_DECISION_COPY } from './demo-decision-copy';

/** D2: sandbox creation and reset only. Direct inserts never call a delivery service. */
export async function populateDecisionFixture(db: PoolClient, ids: typeof fixtureIds, today: string) {
  // Choose a working day with no booked visits or existing time off. Do not move
  // any jobs to make the example approvable. Workspace dates govern the search.
  const free = (await db.query(`SELECT d::date::text AS day FROM generate_series($3::date+1,$3::date+60,interval '1 day') d
    JOIN members m ON m.workspace_id=$1 AND m.user_id=$2
    JOIN workspaces s ON s.id=m.workspace_id
    WHERE NOT (extract(dow FROM d)::smallint=ANY(m.off_days))
      AND NOT EXISTS (SELECT 1 FROM time_off t WHERE t.workspace_id=$1 AND t.user_id=$2
        AND t.status<>'declined' AND d::date BETWEEN t.starts_on AND t.ends_on)
      AND NOT EXISTS (SELECT 1 FROM work_orders w WHERE w.workspace_id=$1 AND w.assignee_id=$2
        AND w.archived_at IS NULL AND w.status IN ('scheduled','in_progress','waiting_on_parts')
        AND (w.scheduled_for AT TIME ZONE s.timezone)::date=d::date)
    ORDER BY d LIMIT 1`, [ids.ridgeline, ids.ravi, today])).rows[0];
  if (!free) throw new Error('No free day for the sample leave request');
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.ravi]);
  await db.query(`INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,created_by,status)
    VALUES($1,$2,'leave',$3,$3,$2,'pending')`, [ids.ridgeline, ids.ravi, free.day]);
  await db.query(`INSERT INTO agent_questions(workspace_id,asked_by,question,proposed)
    VALUES($1,$2,$3,$4)`, [ids.ridgeline, ids.ravi, DEMO_DECISION_COPY.question, DEMO_DECISION_COPY.proposed]);

  // A fictional proposal from Sam, not a claim that AI inferred a habit. Company
  // scope uses the ordinary admin approval gate even for this low risk wording.
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.sam]);
  await db.query(`INSERT INTO lesson_proposals(workspace_id,proposed_by,proposed_by_name,body,scope,reason)
    VALUES($1,$2,'Sam',$3,'company','company')`, [ids.ridgeline, ids.sam, DEMO_DECISION_COPY.lesson]);
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);
}
