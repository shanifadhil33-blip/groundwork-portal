import { afterAll, describe, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { scheduleBoard } from '../lib/services/schedule';
import { addDays, weekStart } from '../components/app/schedule';
import { officeOnlyPath, providerOnlyPath } from '../lib/ui/work-orders';
import { getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { scheduledInstant } from '../lib/dates';
import { tools } from '../lib/agent/tools';
afterAll(async () => { await closePools(); });
const P = (from: string, days = 7) => new URLSearchParams({ from, days: String(days) });
describe('schedule board', () => {
  it('weeks start on Monday and days add across months', () => {
    expect(weekStart('2026-10-12')).toBe('2026-10-12'); expect(weekStart('2026-10-18')).toBe('2026-10-12'); expect(weekStart('2026-11-01')).toBe('2026-10-26');
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
  });
  it('shows the office every scheduled job in the range, in workspace days, and the unscheduled active ones', async () => {
    const from = '2026-09-28', b = await scheduleBoard(ids.imran, ids.ridgeline, P(from, 14));
    const want = (await withSystem(db => db.query("SELECT count(*)::int n FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE w.workspace_id=$1 AND w.status<>'cancelled' AND (w.scheduled_for AT TIME ZONE s.timezone)::date BETWEEN $2::date AND $2::date+13", [ids.ridgeline, from]))).rows[0].n;
    expect(b.jobs.length).toBe(want);
    for (const j of b.jobs) { expect(j.day >= from && j.day <= addDays(from, 13)).toBe(true); expect(j.hour).toBeGreaterThanOrEqual(0); }
    for (const j of b.unscheduled) { expect(j.scheduled_for).toBeNull(); expect(['done', 'cancelled']).not.toContain(j.status); }
    expect(b.people.map(p => p.role)).not.toContain('client');
  });
  it('only admins and supervisors can open it', async () => {
    await expect(scheduleBoard(ids.sam, ids.ridgeline, P('2026-10-12'))).resolves.toBeTruthy();
    for (const u of [ids.ravi, ids.pranav, ids.summitAdmin]) await expect(scheduleBoard(u, ids.ridgeline, P('2026-10-12'))).rejects.toThrow();
    await expect(scheduleBoard(ids.imran, ids.ridgeline, P('nope'))).rejects.toThrow();
    expect(officeOnlyPath('/schedule')).toBe(true); expect(providerOnlyPath('/schedule')).toBe(true); expect(tools.get_schedule.write).toBe(false);
  });
  it('a move lands on the chosen day and hour in the workspace time zone, with the new person', async () => {
    const j = (await withSystem(db => db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('scheduled','in_progress') LIMIT 1", [ids.ridgeline]))).rows[0];
    const o = await getWorkOrder(ids.imran, ids.ridgeline, j.id);
    await patchWorkOrder(ids.imran, ids.ridgeline, j.id, { scheduled_for: scheduledInstant('2026-11-03', 'Asia/Dubai', 14), assignee_id: ids.ravi, updated_at: new Date(o.updated_at).toISOString() });
    const b = await scheduleBoard(ids.imran, ids.ridgeline, P('2026-11-02'));
    const moved = b.jobs.find(x => x.id === j.id)!; expect(moved.day).toBe('2026-11-03'); expect(moved.hour).toBe(14); expect(moved.assignee_id).toBe(ids.ravi);
  });
});
