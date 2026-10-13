import { approvedClientRequest } from './request-fixtures';
import './fixtures';
import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { setClientKind } from '../lib/services/members';
import { listWorkOrders, createWorkOrder, getWorkOrder } from '../lib/services/work-orders';
import { callTool } from '../lib/agent/tools';
import { toolsFor } from '../lib/agent/role-tools';
const ws = ids.ridgeline;
afterAll(closePools);
it('gives each role only its own agent tools, checked on the server', async () => {
  expect(toolsFor('client')).not.toContain('assign_work_order');
  expect(toolsFor('technician')).not.toContain('create_client');
  expect(toolsFor('admin')).toBeNull();
  const r: any = await callTool({ user: ids.ravi, ws, scope: 'write', kind: 'agent' }, 'list_team', {});
  expect(r.isError).toBe(true);
  const p: any = await callTool({ user: ids.pranav, ws, scope: 'write', kind: 'agent' }, 'set_priority', { id: '50000000-0000-4000-8000-000000000001', priority: 'urgent' });
  expect(p.isError).toBe(true);
  const ok: any = await callTool({ user: ids.pranav, ws, scope: 'read', kind: 'agent' }, 'list_work_orders', {});
  expect(ok.isError).toBeUndefined();
});
it('a household sees only the requests he raised; only an admin sets the client type', async () => {
  await expect(setClientKind(ids.sam, ws, ids.omar, { kind: 'household' })).rejects.toMatchObject({ status: 403 });
  await expect(setClientKind(ids.imran, ws, ids.ravi, { kind: 'household' })).rejects.toMatchObject({ status: 422 });
  const all: any = await listWorkOrders(ids.omar, ws, new URLSearchParams('pageSize=100&active=false'));
  expect(all.data.length).toBeGreaterThan(0);
  const other = all.data[0].id;
  await setClientKind(ids.imran, ws, ids.omar, { kind: 'household' });
  try {
    const site = await withSystem(async db => (await db.query('SELECT id FROM sites WHERE workspace_id=$1 AND client_id=$2 LIMIT 1', [ws, ids.northgate])).rows[0].id);
    const mine: any = await approvedClientRequest(ids.omar, ws, { title: 'Leak under my sink', site_id: site, preferred_window:'Saturday after 4 PM' });
    const seen: any = await listWorkOrders(ids.omar, ws, new URLSearchParams('pageSize=100&active=false'));
    expect(seen.data.map((o: any) => o.id)).toEqual([mine.id]);
    await expect(getWorkOrder(ids.omar, ws, other)).rejects.toMatchObject({ status: 404 });
    expect((await listWorkOrders(ids.imran, ws, new URLSearchParams('pageSize=100&active=false'))).total).toBeGreaterThan(1);
  } finally { await setClientKind(ids.imran, ws, ids.omar, { kind: 'manager' }); }
});
it('a technician saves the job report through the agent only on his own job', async () => {
  expect(toolsFor('technician')).toContain('save_job_report');
  const mine = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status NOT IN ('done','cancelled') LIMIT 1", [ws, ids.ravi])).rows[0]);
  const other = await withSystem(async db => (await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id IS DISTINCT FROM $2 AND status NOT IN ('done','cancelled') LIMIT 1", [ws, ids.ravi])).rows[0]);
  if (other) { const r: any = await callTool({ user: ids.ravi, ws, scope: 'write', kind: 'assistant' }, 'save_job_report', { id: other.id, outcome: 'fixed' }); expect(r.isError).toBe(true); }
  const bad: any = await callTool({ user: ids.ravi, ws, scope: 'write', kind: 'assistant' }, 'save_job_report', { id: mine.id, outcome: 'fixed', amount: 50 });
  expect(bad.isError).toBe(true);
  const ok: any = await callTool({ user: ids.ravi, ws, scope: 'write', kind: 'assistant' }, 'save_job_report', { id: mine.id, outcome: 'needs_part', work: 'Checked the pump' });
  expect(ok.isError).toBeUndefined();
  expect((await getWorkOrder(ids.ravi, ws, mine.id) as any).status).toBe('waiting_on_parts');
  const off: any = await callTool({ user: ids.ravi, ws, scope: 'write', kind: 'assistant' }, 'set_priority', { id: mine.id, priority: 'urgent' });
  expect(off.isError).toBe(true);
});
