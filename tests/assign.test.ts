import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem } from '../lib/db';
import { ids, orderId } from '../scripts/seed';
import { setWorkerSkills, suggestWorkers } from '../lib/services/assign';
import { createWorkOrder, getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { tools } from '../lib/agent/tools';
import { actionSummary } from '../lib/ui/assistant-replies';
let user: string | null = ids.imran;
beforeEach(() => { user = ids.imran; setAuthResolverForTests(async () => user); });
afterAll(async () => { setAuthResolverForTests(); await closePools(); });
const reset = () => withSystem(db => db.query("UPDATE members SET trades='{}',areas='{}' WHERE workspace_id=$1", [ids.ridgeline]));
describe('assign by trade and area', () => {
  it('a job can carry a trade, set by the office, never by a technician', async () => {
    const o = await getWorkOrder(ids.imran, ids.ridgeline, orderId(3));
    const u = await patchWorkOrder(ids.imran, ids.ridgeline, o.id, { trade: 'plumbing', updated_at: new Date(o.updated_at).toISOString() });
    expect(u.trade).toBe('plumbing');
    await expect(patchWorkOrder(ids.imran, ids.ridgeline, o.id, { trade: 'rocket', updated_at: new Date(u.updated_at).toISOString() })).rejects.toThrow();
    const site = (await withSystem(db => db.query('SELECT site_id FROM work_orders WHERE id=$1', [o.id]))).rows[0].site_id;
    const made = await createWorkOrder(ids.imran, ids.ridgeline, { title: 'Fix a light', site_id: site, trade: 'electrical' });
    expect(made.trade).toBe('electrical');
  });
  it('the right trade wins, then the right area, then fewest jobs today', async () => {
    await reset();
    const o = await getWorkOrder(ids.imran, ids.ridgeline, orderId(3));
    const area = (await withSystem(db => db.query('SELECT s.area FROM work_orders w JOIN sites s ON s.id=w.site_id WHERE w.id=$1', [o.id]))).rows[0].area as string;
    await setWorkerSkills(ids.imran, ids.ridgeline, ids.sam, { trades: ['plumbing'], areas: [] });
    await setWorkerSkills(ids.imran, ids.ridgeline, ids.ravi, { trades: [], areas: [area] });
    let s = await suggestWorkers(ids.imran, ids.ridgeline, o.id);
    expect(s.trade).toBe('plumbing'); expect(s.workers[0].user_id).toBe(ids.sam); expect(s.workers[1].user_id).toBe(ids.ravi);
    await setWorkerSkills(ids.imran, ids.ridgeline, ids.ravi, { trades: ['plumbing'], areas: [area] });
    s = await suggestWorkers(ids.imran, ids.ridgeline, o.id);
    expect(s.workers[0].user_id).toBe(ids.ravi); expect(s.workers[0].trade_match && s.workers[0].area_match).toBe(true);
    expect(s.workers.map(w => w.user_id)).not.toContain(ids.pranav);
    await reset();
  });
  it('only admins and supervisors set skills; supervisors only for technicians; clients never see suggestions', async () => {
    await expect(setWorkerSkills(ids.sam, ids.ridgeline, ids.ravi, { trades: ['ac'], areas: [] })).resolves.toBeTruthy();
    await expect(setWorkerSkills(ids.sam, ids.ridgeline, ids.imran, { trades: ['ac'], areas: [] })).rejects.toThrow();
    await expect(setWorkerSkills(ids.ravi, ids.ridgeline, ids.ravi, { trades: ['ac'], areas: [] })).rejects.toThrow();
    await expect(setWorkerSkills(ids.imran, ids.ridgeline, ids.pranav, { trades: ['ac'], areas: [] })).rejects.toThrow();
    await expect(setWorkerSkills(ids.imran, ids.ridgeline, ids.summitAdmin, { trades: ['ac'], areas: [] })).rejects.toThrow();
    await expect(suggestWorkers(ids.pranav, ids.ridgeline, orderId(1))).rejects.toThrow();
    await expect(suggestWorkers(ids.ravi, ids.ridgeline, orderId(1))).rejects.toThrow();
    await reset();
  });
  it('a technician cannot change the trade of his job', async () => {
    const mine = (await withSystem(db => db.query("SELECT id,updated_at FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled') LIMIT 1", [ids.ridgeline, ids.ravi]))).rows[0];
    await expect(patchWorkOrder(ids.ravi, ids.ridgeline, mine.id, { trade: 'ac', updated_at: mine.updated_at.toISOString() })).rejects.toThrow();
  });
  it('assistant tools: reads need no card, writes always need one, with plain words', () => {
    expect(tools.suggest_worker.write).toBe(false);
    for (const t of ['assign_work_order', 'set_job_trade', 'set_worker_skills']) expect(tools[t].write).toBe(true);
    const order = { id: 'x', order_number: 7, title: 'Leak', status: 'open', priority: 'normal' };
    expect(actionSummary('assign_work_order', {}, order, 'Ravi')).toBe('Assign WO-7 Leak to Ravi');
    expect(actionSummary('set_job_trade', { trade: 'ac' }, order)).toBe('Set the trade for WO-7 Leak: AC');
    expect(actionSummary('set_worker_skills', { trades: ['plumbing'], areas: ['Al Barsha'] }, null, 'Ravi')).toContain('Trade: Plumbing');
  });
});
