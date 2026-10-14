import { afterAll, expect, it, vi } from 'vitest';
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { getRating, rateJob } from '../lib/services/ratings';
afterAll(async () => { await withSystem(db => db.query('DELETE FROM job_ratings WHERE workspace_id=$1', [ids.ridgeline])); await closePools(); });
const job = (status: string) => withSystem(async db => (await db.query(`SELECT w.id FROM work_orders w JOIN members m ON m.client_id=w.client_id AND m.workspace_id=w.workspace_id WHERE w.workspace_id=$1 AND m.user_id=$2 AND w.status=$3 ORDER BY w.order_number LIMIT 1`, [ids.ridgeline, ids.omar, status])).rows[0]?.id as string | undefined);
it('CMP09: the client rates a done job once, staff see it, others cannot', async () => {
  const done = await job('done'); expect(done).toBeTruthy();
  await withSystem(db => db.query('DELETE FROM job_ratings WHERE work_order_id=$1', [done]));
  expect((await getRating(ids.omar, ids.ridgeline, done!)).can_rate).toBe(true);
  expect((await getRating(ids.imran, ids.ridgeline, done!)).can_rate).toBe(false);
  await expect(rateJob(ids.imran, ids.ridgeline, done!, { stars: 5 })).rejects.toThrow(/Only the client/);
  await expect(rateJob(ids.omar, ids.ridgeline, done!, { stars: 9 })).rejects.toThrow();
  const r = await rateJob(ids.omar, ids.ridgeline, done!, { stars: 4, note: 'Quick and tidy' });
  expect(r.rating.stars).toBe(4);
  await expect(rateJob(ids.omar, ids.ridgeline, done!, { stars: 1 })).rejects.toThrow(/already/);
  expect((await getRating(ids.sam, ids.ridgeline, done!)).rating?.stars).toBe(4);
  await expect(getRating(ids.pranav, ids.ridgeline, done!)).rejects.toThrow();
});
it('CMP09: a job that is not done cannot be rated', async () => {
  const open = await job('open') ?? await job('scheduled'); if (!open) return;
  await expect(rateJob(ids.omar, ids.ridgeline, open, { stars: 3 })).rejects.toThrow(/once it is done/);
});
