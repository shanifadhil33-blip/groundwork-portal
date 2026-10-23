import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { DEMO_MEMORY_COPY } from './demo-memory-copy';

/** Fictional history for new/reset Ridgeline sandboxes only. No model or delivery calls. */
export async function populateCompanyMemoryFixture(db: PoolClient, ids: typeof fixtureIds) {
  const lessons = [
    { body: DEMO_MEMORY_COPY.technician, recorder: ids.ravi, days: 12, uses: 8 },
    { body: DEMO_MEMORY_COPY.access, recorder: ids.sam, days: 9, uses: 5 },
    { body: DEMO_MEMORY_COPY.parts, recorder: ids.imran, days: 6, uses: 3 },
  ];
  for (const lesson of lessons) {
    const rule = (await db.query(`INSERT INTO company_rules(workspace_id,body,created_by,created_at)
      VALUES($1,$2,$3,now()-$4*interval '1 day') RETURNING id`,
    [ids.ridgeline, lesson.body, lesson.recorder, lesson.days])).rows[0];
    // The same ledger and count semantics as Company Memory, with dates after recording.
    await db.query(`INSERT INTO audit_log(workspace_id,actor_id,actor_kind,action,entity,entity_id,at)
      SELECT $1,$2,'assistant','memory_used','company_rules',$3,
        now()-$4*interval '1 day'+n*interval '12 hours'
      FROM generate_series(1,$5::int) n`, [ids.ridgeline, ids.imran, rule.id, lesson.days, lesson.uses]);
  }
}
