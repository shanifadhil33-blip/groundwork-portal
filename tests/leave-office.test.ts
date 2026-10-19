import { suggestWorkers } from '../lib/services/assign';
import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { requestTimeOff, decideTimeOff, leaveRequests, offReason } from '../lib/services/time-off';
import { listNotifications } from '../lib/services/notifications';
import { callTool } from '../lib/agent/tools';
import { scheduleBoard } from '../lib/services/schedule';
const ws = ids.ridgeline;
afterAll(closePools);
const day = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// The seed books Ravi's jobs relative to the real date, so pick a day he has nothing booked (Oct 20: day 9 hit WO 38).
const freeDay = async (from: number) => { for (let n = from; n < from + 60; n++) { const booked = await withSystem(async db => (await db.query("SELECT 1 FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND w.archived_at IS NULL AND (w.scheduled_for AT TIME ZONE s.timezone)::date=$3::date LIMIT 1", [ws, ids.ravi, day(n)])).rowCount); if (!booked) return n; } throw new Error('no free day'); };
it('a technician asks for time off; a supervisor approves and it shows on the schedule', async () => {
  const off = await freeDay(9);
  const r: any = await requestTimeOff(ids.ravi, ws, { starts_on: day(off) });
  expect(r.status).toBe('pending');
  expect(await withSystem(db => offReason(db as any, ws, ids.ravi, day(off)))).toBeNull();
  await expect(decideTimeOff(ids.ravi, ws, r.id, { decision: 'approved' })).rejects.toMatchObject({ status: 403 });
  const n: any = await listNotifications(ids.sam, ws, new URLSearchParams());
  expect(n.data.some((x: any) => x.kind === 'leave_requested')).toBe(true);
  expect((await leaveRequests(ids.sam, ws) as any).requests.some((x: any) => x.id === r.id)).toBe(true);
  await decideTimeOff(ids.sam, ws, r.id, { decision: 'approved' });
  expect(await withSystem(db => offReason(db as any, ws, ids.ravi, day(off)))).toMatch(/off/);
  const b: any = await scheduleBoard(ids.sam, ws, new URLSearchParams(`from=${day(off - 1)}&days=3`));
  expect(b.away.some((a: any) => a.user_id === ids.ravi)).toBe(true);
  const back: any = await listNotifications(ids.ravi, ws, new URLSearchParams());
  expect(back.data.some((x: any) => x.kind === 'leave_decided')).toBe(true);
  const agent: any = await callTool({ user: ids.ravi, ws, scope: 'write', kind: 'assistant' }, 'request_time_off', { starts_on: day(12) });
  expect(agent.isError).toBeUndefined();
});
it('office staff run jobs but not the team, checked on the server', async () => {
  await withSystem(db => db.query("UPDATE members SET staff_kind='office' WHERE workspace_id=$1 AND user_id=$2", [ws, ids.sam]));
  try {
    const job = await withSystem(async db => (await db.query("SELECT id, updated_at FROM work_orders WHERE workspace_id=$1 AND status NOT IN ('done','cancelled') LIMIT 1", [ws])).rows[0]);
    const sw: any = await suggestWorkers(ids.sam, ws, job.id); const best = sw.workers.find((w: any) => !w.off && (w.trade_match || w.area_match)); const other = sw.workers.find((w: any) => w.user_id !== best?.user_id)?.user_id ?? ids.imran;
    const a: any = await callTool({ user: ids.sam, ws, scope: 'write', kind: 'agent' }, 'assign_work_order', { id: job.id, assignee_id: other, updated_at: new Date(job.updated_at).toISOString() });
    expect(a.isError).toBe(true);
    const ok: any = await callTool({ user: ids.sam, ws, scope: 'read', kind: 'agent' }, 'list_work_orders', {});
    expect(ok.isError).toBeUndefined();
    const r: any = await requestTimeOff(ids.ravi, ws, { starts_on: day(20) });
    await expect(decideTimeOff(ids.sam, ws, r.id, { decision: 'approved' })).rejects.toMatchObject({ status: 403 });
  } finally { await withSystem(db => db.query('UPDATE members SET staff_kind=NULL WHERE workspace_id=$1 AND user_id=$2', [ws, ids.sam])); }
});
