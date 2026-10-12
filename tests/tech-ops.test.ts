import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { addTimeOff, listTimeOff, removeTimeOff, setOffDays } from '../lib/services/time-off';
import { createWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { suggestWorkers } from '../lib/services/assign';
import { jobRecord, saveJobReport } from '../lib/services/job-report';

const ws = ids.ridgeline, made: string[] = [];
const dubaiDay = (offset: number) => new Date(Date.now() + 4 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const nineAm = (d: string) => new Date(`${d}T05:00:00Z`).toISOString();
async function site() { return withSystem(async db => (await db.query("SELECT id, client_id FROM sites WHERE workspace_id=$1 ORDER BY name LIMIT 1", [ws])).rows[0]); }
async function job(extra: Record<string, unknown> = {}) {
  const s = await site();
  const o = await createWorkOrder(ids.imran, ws, { title: 'Tech ops test job', client_id: s.client_id, site_id: s.id, ...extra }) as { id: string; updated_at: string; status: string };
  made.push(o.id); return { ...o, updated_at: new Date(o.updated_at).toISOString() };
}
afterEach(async () => {
  await withSystem(async db => {
    await db.query('DELETE FROM time_off WHERE workspace_id=$1', [ws]);
    await db.query("UPDATE members SET off_days='{}' WHERE workspace_id=$1", [ws]);
    for (const id of made.splice(0)) { for (const t of ['work_order_events', 'comments', 'notifications']) await db.query(`DELETE FROM ${t} WHERE ${t === 'notifications' ? 'entity_id' : 'work_order_id'}=$1`, [id]).catch(() => undefined); await db.query('DELETE FROM work_orders WHERE id=$1', [id]).catch(() => undefined); }
  }, ids.imran);
});
afterAll(async () => { await closePools(); });

describe('days off and leave', () => {
  it('a job cannot be given to someone on leave, and the reason is plain', async () => {
    const d = dubaiDay(2);
    await addTimeOff(ids.sam, ws, { user_id: ids.ravi, kind: 'leave', starts_on: d });
    await expect(job({ assignee_id: ids.ravi, scheduled_for: nineAm(d) })).rejects.toMatchObject({ status: 422 });
    await expect(job({ assignee_id: ids.ravi, scheduled_for: nineAm(d) })).rejects.toThrow(/on leave that day/);
    const ok = await job({ assignee_id: ids.ravi, scheduled_for: nineAm(dubaiDay(3)) });
    await expect(patchWorkOrder(ids.imran, ws, ok.id, { scheduled_for: nineAm(d), updated_at: ok.updated_at })).rejects.toMatchObject({ status: 422 });
  });
  it('weekly days off block that weekday and put the person last in suggestions', async () => {
    const d = dubaiDay(4), weekday = new Date(`${d}T00:00:00Z`).getUTCDay();
    await setOffDays(ids.imran, ws, ids.ravi, { off_days: [weekday] });
    await expect(job({ assignee_id: ids.ravi, scheduled_for: nineAm(d) })).rejects.toThrow(/off that day/);
    const o = await job({ scheduled_for: nineAm(d) });
    const s = await suggestWorkers(ids.imran, ws, o.id) as { workers: { user_id: string; off?: string | null }[] };
    const ravi = s.workers.findIndex(w => w.user_id === ids.ravi);
    expect(s.workers[ravi].off).toMatch(/off that day/);
    expect(s.workers.slice(ravi).every(w => w.off)).toBe(true);
  });
  it('only the office manages time off; a technician sees only his own', async () => {
    await expect(addTimeOff(ids.ravi, ws, { user_id: ids.ravi, kind: 'off', starts_on: dubaiDay(1) })).rejects.toMatchObject({ status: 403 });
    await expect(addTimeOff(ids.pranav, ws, { user_id: ids.ravi, kind: 'off', starts_on: dubaiDay(1) })).rejects.toBeTruthy();
    const a = await addTimeOff(ids.imran, ws, { user_id: ids.sam, kind: 'sick', starts_on: dubaiDay(1) }) as { id: string };
    await addTimeOff(ids.imran, ws, { user_id: ids.ravi, kind: 'leave', starts_on: dubaiDay(1), ends_on: dubaiDay(2) });
    const office = await listTimeOff(ids.sam, ws);
    expect(office.time_off.map((t: { name: string | null }) => t.name)).toEqual(expect.arrayContaining(['Sam', 'Ravi']));
    const mine = await listTimeOff(ids.ravi, ws);
    expect(mine.time_off.every((t: { user_id: string }) => t.user_id === ids.ravi)).toBe(true);
    expect(Object.keys(mine.off_days)).toEqual([ids.ravi]);
    await expect(removeTimeOff(ids.ravi, ws, a.id)).rejects.toMatchObject({ status: 403 });
    expect(await removeTimeOff(ids.sam, ws, a.id)).toEqual({ deleted: true });
  });
  it('the last day cannot be before the first', async () => {
    await expect(addTimeOff(ids.imran, ws, { user_id: ids.ravi, kind: 'leave', starts_on: dubaiDay(3), ends_on: dubaiDay(1) })).rejects.toMatchObject({ status: 422 });
  });
});

describe('job report', () => {
  it('Fixed closes the job, saves the words, and counts it', async () => {
    const before = await jobRecord(ids.ravi, ws, ids.ravi);
    const o = await job({ assignee_id: ids.ravi, scheduled_for: nineAm(dubaiDay(0)) });
    const r = await saveJobReport(ids.ravi, ws, o.id, { problem: 'Tap leaking', work: 'New washer', outcome: 'fixed', updated_at: o.updated_at });
    expect(r.status).toBe('done'); expect(r.record.month).toBe(before.month + 1); expect(r.record.total).toBe(before.total + 1);
    const saved = await withSystem(async db => (await db.query('SELECT report_problem, report_work, report_outcome, report_by FROM work_orders WHERE id=$1', [o.id])).rows[0]);
    expect(saved).toEqual({ report_problem: 'Tap leaking', report_work: 'New washer', report_outcome: 'fixed', report_by: ids.ravi });
  });
  it('an empty report still closes the job as Fixed', async () => {
    const o = await job({ assignee_id: ids.ravi, scheduled_for: nineAm(dubaiDay(0)) });
    expect((await saveJobReport(ids.ravi, ws, o.id, { updated_at: o.updated_at })).status).toBe('done');
  });
  it('Needs a part waits for parts; Can\'t be fixed stays open for the supervisor', async () => {
    const a = await job({ assignee_id: ids.ravi, scheduled_for: nineAm(dubaiDay(0)) });
    expect((await saveJobReport(ids.ravi, ws, a.id, { outcome: 'needs_part', updated_at: a.updated_at })).status).toBe('waiting_on_parts');
    const b = await job({ assignee_id: ids.ravi, scheduled_for: nineAm(dubaiDay(0)) });
    const r = await saveJobReport(ids.ravi, ws, b.id, { outcome: 'cant_fix', updated_at: b.updated_at });
    expect(r.status).not.toBe('done'); expect(r.outcome).toBe('cant_fix');
  });
  it('a technician cannot report on a job that is not his, and clients cannot report', async () => {
    const o = await job({ assignee_id: ids.sam, scheduled_for: nineAm(dubaiDay(0)) });
    await expect(saveJobReport(ids.ravi, ws, o.id, { updated_at: o.updated_at })).rejects.toHaveProperty('status', expect.any(Number));
    expect(await withSystem(async db => (await db.query('SELECT report_outcome FROM work_orders WHERE id=$1', [o.id])).rows[0].report_outcome)).toBeNull();
    await expect(saveJobReport(ids.pranav, ws, o.id, { updated_at: o.updated_at })).rejects.toBeTruthy();
    await expect(jobRecord(ids.ravi, ws, ids.sam)).rejects.toMatchObject({ status: 403 });
  });
});
