import { afterAll, describe, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { myDay } from '../lib/services/my-day';
import { nextStep } from '../components/app/my-day';
import { officeOnlyPath, providerOnlyPath } from '../lib/ui/work-orders';
import { tools } from '../lib/agent/tools';
afterAll(async () => { await closePools(); });
describe('My jobs today', () => {
  it('a technician gets only his own jobs: today in time order, late, next days', async () => {
    const d = await myDay(ids.ravi, ids.ridgeline);
    const mine = (await withSystem(db => db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2", [ids.ridgeline, ids.ravi]))).rows.map(r => r.id);
    for (const j of [...d.today, ...d.late, ...d.next]) expect(mine).toContain(j.id);
    const times = d.today.map(j => new Date(j.scheduled_for).getTime()); expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const j of d.today) expect(['done', 'cancelled']).not.toContain(j.status);
    for (const j of d.late) expect(d.today.map(t => t.id)).not.toContain(j.id);
    expect(d.next.length).toBeLessThanOrEqual(5); expect(typeof d.done).toBe('number');
    const want = (await withSystem(db => db.query(`SELECT count(*)::int n FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND w.status NOT IN ('done','cancelled') AND (w.scheduled_for AT TIME ZONE s.timezone)::date=(now() AT TIME ZONE s.timezone)::date`, [ids.ridgeline, ids.ravi]))).rows[0].n;
    expect(d.today.length).toBe(want);
  });
  it('clients are refused', async () => { await expect(myDay(ids.pranav, ids.ridgeline)).rejects.toThrow(); });
  it('one next step per status, and none while waiting for a time', () => {
    expect(nextStep('scheduled')).toEqual({ to: 'in_progress', label: 'Start' });
    expect(nextStep('waiting_on_parts')?.label).toBe('Start');
    expect(nextStep('in_progress')).toEqual({ to: 'done', label: 'Done' });
    expect(nextStep('open')).toBeNull(); expect(nextStep('done')).toBeNull();
  });
  it('technicians can open /today, clients cannot; the assistant can read the day', () => {
    expect(officeOnlyPath('/today')).toBe(false); expect(providerOnlyPath('/today')).toBe(true);
    expect(officeOnlyPath('/team')).toBe(true);
    expect(tools.my_day.write).toBe(false);
  });
});
import { patchWorkOrder, getWorkOrder } from '../lib/services/work-orders';
describe('Done today', () => {
  it('counts only jobs moved to Done today, not jobs just edited today', async () => {
    const before = (await myDay(ids.ravi, ids.ridgeline)).done;
    await withSystem(db => db.query("UPDATE work_orders SET updated_at=now() WHERE workspace_id=$1 AND assignee_id=$2 AND status='done'", [ids.ridgeline, ids.ravi]));
    expect((await myDay(ids.ravi, ids.ridgeline)).done).toBe(before);
    const j = (await withSystem(db => db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status='in_progress' LIMIT 1", [ids.ridgeline, ids.ravi]))).rows[0];
    if (!j) return;
    const o = await getWorkOrder(ids.ravi, ids.ridgeline, j.id);
    await patchWorkOrder(ids.ravi, ids.ridgeline, j.id, { status: 'done', updated_at: new Date(o.updated_at).toISOString() });
    expect((await myDay(ids.ravi, ids.ridgeline)).done).toBe(before + 1);
  });
});
