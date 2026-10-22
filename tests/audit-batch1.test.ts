import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { createWorkOrder, getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { decideSuggestion, listSuggestions, withdrawSuggestion } from '../lib/services/suggestions';
import { requestTimeOff, decideTimeOff } from '../lib/services/time-off';
import { sendQuote, decideQuote } from '../lib/services/quotes';
import { notificationMessage } from '../lib/ui/notifications';
const ws = ids.ridgeline;
afterAll(closePools);
const day = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const v = (o: any) => new Date(o.updated_at).toISOString();
async function job(title: string) {
  const s = await createWorkOrder(ids.pranav, ws, { title, description: 'Audit', site_id: siteId(1), preferred_window: 'Saturday after 4 PM' });
  const a = await decideSuggestion(ids.sam, ws, s.id, { decision: 'approved' });
  return getWorkOrder(ids.sam, ws, a.work_order_id) as Promise<any>;
}
const bell = (user: string, id: string, kind: string) => withSystem(db => db.query('SELECT 1 FROM notifications WHERE user_id=$1 AND entity_id=$2 AND kind=$3', [user, id, kind])).then(r => r.rowCount);
// Audit A2 and A4: the technician who loses a job, and everyone on a moved visit, is told.
it('reassigning tells the old technician and moving the visit tells the technician and client', async () => {
  let o = await job('Audit reassign');
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.ravi, scheduled_for: day(30), status: 'scheduled', updated_at: v(o) });
  o = await patchWorkOrder(ids.sam, ws, o.id, { scheduled_for: day(31), updated_at: v(o) });
  expect(await bell(ids.ravi, o.id, 'visit_changed')).toBeGreaterThan(0);
  expect(await bell(ids.pranav, o.id, 'visit_changed')).toBeGreaterThan(0);
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.sam, updated_at: v(o) });
  expect(await bell(ids.ravi, o.id, 'job_unassigned')).toBe(1);
  expect(notificationMessage({ kind: 'job_unassigned', actor_name: 'Sam', work_order_title: 'Leak' } as any)).toContain('You do not need to go');
});
// Audit A5 and A8: an unassigned job goes back to open, and a started job can stop for today.
it('unassigning reopens the job and a technician can stop for today', async () => {
  let o = await job('Audit unassign');
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.ravi, scheduled_for: day(32), status: 'scheduled', updated_at: v(o) });
  o = await patchWorkOrder(ids.ravi, ws, o.id, { status: 'in_progress', updated_at: v(o) });
  o = await patchWorkOrder(ids.ravi, ws, o.id, { status: 'scheduled', updated_at: v(o) });
  expect(o.status).toBe('scheduled');
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: null, updated_at: v(o) });
  expect(o.status).toBe('open');
});
// Audit A6: a declined price stops the technician from starting.
it('a technician cannot start after the client declined the price', async () => {
  let o = await job('Audit declined');
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.ravi, scheduled_for: day(33), status: 'scheduled', updated_at: v(o) });
  await sendQuote(ids.imran, ws, o.id, { amount: 90 });
  await decideQuote(ids.pranav, ws, o.id, { decision: 'declined' });
  o = await getWorkOrder(ids.ravi, ws, o.id);
  expect(await bell(ids.ravi, o.id, 'quote_decided')).toBe(1);
  await expect(patchWorkOrder(ids.ravi, ws, o.id, { status: 'in_progress', updated_at: v(o) })).rejects.toMatchObject({ status: 409 });
});
// Audit A3: approving leave over booked jobs is refused with the job named.
it('approving leave over a booked job is refused', async () => {
  let o = await job('Audit leave clash');
  const d = '2027-02-17';
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.ravi, scheduled_for: d, status: 'scheduled', updated_at: v(o) });
  const r = await requestTimeOff(ids.ravi, ws, { starts_on: d });
  await expect(decideTimeOff(ids.sam, ws, r.id, { decision: 'approved' })).rejects.toMatchObject({ status: 409 });
});
// Audit A7: the sender withdraws a request the office has not answered.
it('a client withdraws his pending request but not an answered one', async () => {
  const s = await createWorkOrder(ids.faisal, ws, { title: 'Audit withdraw', site_id: siteId(4), preferred_window: 'Saturday after 4 PM' });
  await expect(withdrawSuggestion(ids.omar, ws, s.id)).rejects.toMatchObject({ status: 404 });
  await withdrawSuggestion(ids.faisal, ws, s.id);
  expect((await listSuggestions(ids.faisal, ws)).data.some(r => r.id === s.id)).toBe(false);
  const t = await createWorkOrder(ids.faisal, ws, { title: 'Audit answered', site_id: siteId(4), preferred_window: 'Saturday after 4 PM' });
  await decideSuggestion(ids.sam, ws, t.id, { decision: 'approved' });
  await expect(withdrawSuggestion(ids.faisal, ws, t.id)).rejects.toMatchObject({ status: 409 });
});
// Audit A2: an old bell item no longer links to a job that was given to someone else.
it('a moved technician keeps the bell item but it no longer opens the job', async () => {
  const { listNotifications } = await import('../lib/services/notifications');
  let o = await job('Audit stale link');
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.ravi, scheduled_for: day(34), status: 'scheduled', updated_at: v(o) });
  o = await patchWorkOrder(ids.sam, ws, o.id, { assignee_id: ids.sam, updated_at: v(o) });
  const mine = (await listNotifications(ids.ravi, ws, new URLSearchParams('pageSize=100'))).data.filter(n => n.entity_id === o.id);
  expect(mine.length).toBeGreaterThan(0);
  expect(mine.every(n => !n.link_target)).toBe(true);
});
