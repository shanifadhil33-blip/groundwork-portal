import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { createWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { setJobPayment } from '../lib/services/payments';
import { getClient } from '../lib/services/clients';
import { jobSnapshot, listDecisions, undoDecision } from '../lib/services/agent-log';

const ws = ids.ridgeline, made: string[] = [], logs: string[] = [];
async function job() {
  const s = await withSystem(async db => (await db.query('SELECT id, client_id FROM sites WHERE workspace_id=$1 AND client_id=$2 ORDER BY name LIMIT 1', [ws, ids.harbor])).rows[0]);
  const o = await createWorkOrder(ids.imran, ws, { title: 'Agent log test job', client_id: s.client_id, site_id: s.id }) as any;
  made.push(o.id); return o;
}
async function logAction(tool: string, before: unknown) {
  const id = await withSystem(async db => (await db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before,consumed_at,outcome) VALUES($1,$2,$3,'{}','Test action','Because the test said so',$4,now(),'done') RETURNING id", [ws, ids.imran, tool, JSON.stringify(before)])).rows[0].id, ids.imran);
  logs.push(id); return id as string;
}
afterEach(async () => {
  await withSystem(async db => {
    for (const id of logs.splice(0)) await db.query('DELETE FROM assistant_actions WHERE id=$1', [id]);
    for (const id of made.splice(0)) { for (const t of ['work_order_events', 'comments', 'notifications']) await db.query(`DELETE FROM ${t} WHERE ${t === 'notifications' ? 'entity_id' : 'work_order_id'}=$1`, [id]).catch(() => undefined); await db.query('DELETE FROM work_orders WHERE id=$1', [id]); }
  }, ids.imran);
});
afterAll(async () => { await closePools(); });

describe('contract payment', () => {
  it('only an admin marks a job covered by the contract, and it counts as a contract visit', async () => {
    const o = await job();
    const before = (await getClient(ids.imran, ws, ids.harbor)).contract_used;
    await expect(setJobPayment(ids.sam, ws, o.id, { payment_status: 'contract' })).rejects.toMatchObject({ status: 403 });
    await expect(setJobPayment(ids.ravi, ws, o.id, { payment_status: 'contract' })).rejects.toBeTruthy();
    const saved = await setJobPayment(ids.imran, ws, o.id, { payment_status: 'contract' });
    expect(saved.payment_label).toBe('Covered by contract');
    expect((await getClient(ids.imran, ws, ids.harbor)).contract_used).toBe(before + 1);
  });
});

describe('decision log and undo', () => {
  it('undo puts the assignee back, records who undid it, and cannot run twice', async () => {
    const o = await job();
    const snap = jobSnapshot(o);
    const changed = await patchWorkOrder(ids.imran, ws, o.id, { assignee_id: ids.sam, updated_at: new Date(o.updated_at).toISOString() }) as any;
    expect(changed.assignee_id).toBe(ids.sam);
    const id = await logAction('assign_work_order', snap);
    const log = await listDecisions(ids.sam, ws);
    expect(log.find((d: any) => d.id === id)).toMatchObject({ why: 'Because the test said so', can_undo: true });
    await undoDecision(ids.sam, ws, id);
    const back = await withSystem(async db => (await db.query('SELECT assignee_id FROM work_orders WHERE id=$1', [o.id])).rows[0], ids.imran);
    expect(back.assignee_id).toBe(o.assignee_id ?? null);
    expect((await listDecisions(ids.imran, ws)).find((d: any) => d.id === id)).toMatchObject({ undone_by_name: 'Sam', can_undo: false });
    await expect(undoDecision(ids.imran, ws, id)).rejects.toMatchObject({ status: 409 });
  });
  it('technicians and clients cannot read the log or undo', async () => {
    const id = await logAction('set_priority', { id: (await job()).id, priority: 'normal' });
    await expect(listDecisions(ids.ravi, ws)).rejects.toBeTruthy();
    await expect(listDecisions(ids.pranav, ws)).rejects.toBeTruthy();
    await expect(undoDecision(ids.ravi, ws, id)).rejects.toBeTruthy();
  });
});
