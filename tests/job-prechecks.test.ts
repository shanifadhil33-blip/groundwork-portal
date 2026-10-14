import { afterAll, expect, it, vi } from 'vitest';
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { getPrecheck, savePrecheck } from '../lib/services/prechecks';
import { precheckState, PRECHECK } from '../lib/precheck';
afterAll(async () => { await withSystem(db => db.query('DELETE FROM job_prechecks WHERE workspace_id=$1', [ids.ridgeline])); await closePools(); });
const job = (statuses: string[]) => withSystem(async db => (await db.query(`SELECT w.id FROM work_orders w JOIN members m ON m.client_id=w.client_id AND m.workspace_id=w.workspace_id WHERE w.workspace_id=$1 AND m.user_id=$2 AND w.status=ANY($3) ORDER BY w.order_number LIMIT 1`, [ids.ridgeline, ids.omar, statuses])).rows[0]?.id as string | undefined);
it('ready only when every item is yes', () => {
  expect(precheckState(null).ready).toBe(false);
  expect(precheckState(Object.fromEntries(PRECHECK.map(p => [p.key, true]))).ready).toBe(true);
  expect(precheckState({ home: true }).missing.length).toBe(PRECHECK.length - 1);
  for (const p of PRECHECK) expect(p.label).not.toMatch(/[-–—]/);
});
it('CMP03: the client answers before the visit, staff see what is not ready, others cannot answer', async () => {
  const id = await job(['open', 'scheduled']); expect(id).toBeTruthy();
  expect((await getPrecheck(ids.omar, ids.ridgeline, id!)).can_answer).toBe(true);
  await expect(savePrecheck(ids.imran, ids.ridgeline, id!, { answers: { home: true } })).rejects.toThrow(/Only the client/);
  const r = await savePrecheck(ids.omar, ids.ridgeline, id!, { answers: { home: true, access: false } });
  expect(r.ready).toBe(false);
  const seen = await getPrecheck(ids.sam, ids.ridgeline, id!); expect(seen.answered).toBe(true); expect(seen.missing).toContain('Parking or an access pass is arranged');
  const all = await savePrecheck(ids.omar, ids.ridgeline, id!, { answers: Object.fromEntries(PRECHECK.map(p => [p.key, true])) });
  expect(all.ready).toBe(true);
  await expect(getPrecheck(ids.pranav, ids.ridgeline, id!)).rejects.toThrow();
});
it('CMP03: a finished job cannot get a visit check', async () => {
  const done = await job(['done']); if (!done) return;
  await expect(savePrecheck(ids.omar, ids.ridgeline, done, { answers: { home: true } })).rejects.toThrow(/already started/);
});
