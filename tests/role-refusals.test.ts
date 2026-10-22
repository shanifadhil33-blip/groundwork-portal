import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assistantTurn } from '../lib/ai';
import { callTool } from '../lib/agent/tools';
import { closePools, withSystem, withUser } from '../lib/db';
import { assistant } from '../lib/services/assistant';
import { createWorkOrder, createComment, getWorkOrder, getWorkOrderByNumber, patchWorkOrder } from '../lib/services/work-orders';
import { setJobPayment } from '../lib/services/payments';
import { setMemberRoles } from '../lib/services/members';
import { addTimeOff, decideTimeOff, requestTimeOff } from '../lib/services/time-off';
import { listDecisions } from '../lib/services/agent-log';
import { ids, siteId } from '../scripts/seed';

vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
const ws = ids.ridgeline;
const actors = [ids.imran, ids.sam, ids.nabil, ids.ravi, ids.pranav, ids.kevin, ids.faisal];
// Track even indirect rows (logs, events and notifications) so every insertion is removed.
const cleanupTables = ['company_action_approvals', 'assistant_actions', 'work_order_events', 'comments', 'notifications', 'time_off', 'work_orders', 'audit_log'] as const;
let baseline: Record<string, string[]>;
let omarKind: string | null;
beforeEach(async () => {
 baseline = {};
 await withSystem(async db => {
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);
  omarKind = (await db.query('SELECT client_kind FROM members WHERE workspace_id=$1 AND user_id=$2', [ws, ids.omar])).rows[0].client_kind;
  for (const table of cleanupTables) baseline[table] = (await db.query(`SELECT id FROM ${table} WHERE workspace_id=$1`, [ws])).rows.map(r => r.id);
 });
});
afterEach(async () => {
 await withSystem(async db => {
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);
  await db.query('UPDATE members SET client_kind=$3 WHERE workspace_id=$1 AND user_id=$2 AND client_kind IS DISTINCT FROM $3', [ws, ids.omar, omarKind]);
  for (const table of cleanupTables) await db.query(`DELETE FROM ${table} WHERE workspace_id=$1 AND NOT (id=ANY($2::uuid[]))`, [ws, baseline[table]]);
 });
 vi.mocked(assistantTurn).mockReset();
});
afterAll(closePools);
async function job(owner: string = ids.imran, site = siteId(1), scheduled_for?: string, assignee_id: string | null = ids.ravi) {
 const o = await createWorkOrder(ids.imran, ws, { title: 'Check the tap', site_id: site, assignee_id, ...(scheduled_for ? { scheduled_for } : {}) });
 await withSystem(async db => {
  await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);
  await db.query('UPDATE work_orders SET created_by=$2 WHERE id=$1', [o.id, owner]);
 });
 return getWorkOrder(ids.imran, ws, o.id);
}
const version = (o: { updated_at: Date }) => new Date(o.updated_at).toISOString();
const snapshot = (id: string) => withSystem(async db => {
 await db.query("SELECT set_config('app.user_id',$1,true)", [ids.imran]);
 return {
  order: (await db.query('SELECT * FROM work_orders WHERE id=$1', [id])).rows[0],
  notes: (await db.query('SELECT * FROM comments WHERE work_order_id=$1 ORDER BY id', [id])).rows,
  events: (await db.query('SELECT * FROM work_order_events WHERE work_order_id=$1 ORDER BY id', [id])).rows,
 };
});
function turn(name: string, args: unknown) {
 vi.mocked(assistantTurn).mockResolvedValueOnce({ calls: [{ name, args, id: 'role-refusal' }] } as any)
  .mockResolvedValueOnce({ calls: [], text: 'I can not make that change. Tap Ask below to ask for help.' } as any);
}
const ask = (user: string, content: string) => assistant(user, ws, { messages: [{ role: 'user', content }] }) as Promise<any>;

const changes = [
 { name: 'assign_work_order', ask: 'Give this job to Sam', args: { assignee_id: ids.sam }, service: (o: any) => patchWorkOrder(ids.ravi, ws, o.id, { assignee_id: ids.sam, updated_at: version(o) }) },
 { name: 'set_priority', ask: 'Set this job to urgent', args: { priority: 'urgent' }, service: (o: any) => patchWorkOrder(ids.ravi, ws, o.id, { priority: 'urgent', updated_at: version(o) }) },
 { name: 'set_job_payment', ask: 'Mark this job paid', args: { payment_status: 'paid' }, service: (o: any) => setJobPayment(ids.ravi, ws, o.id, { payment_status: 'paid' }) },
];
describe('technician changes', () => {
 for (const change of changes) {
  it(`${change.name}: service refuses without changing the job`, async () => {
   const o = await job(), before = await snapshot(o.id);
   await expect(change.service(o)).rejects.toMatchObject({ status: 403, code: 'forbidden' });
   expect(await snapshot(o.id)).toEqual(before);
  });
  it(`${change.name}: assistant refuses and offers AGENT11 Ask`, async () => {
   const o = await job(), before = await snapshot(o.id);
   turn(change.name, { id: o.id, ...(change.name === 'set_job_payment' ? {} : { updated_at: version(o) }), ...change.args });
   const r = await ask(ids.ravi, `${change.ask} on WO ${o.order_number}`);
   expect(assistantTurn).toHaveBeenCalled();
   expect(r.pending_action).toBeUndefined();
   const name = change.name === 'set_job_payment' ? 'Imran' : 'Sam';
   expect(r.offers).toEqual([expect.objectContaining({ label: `Ask ${name}`, to_name: name, work_order_id: o.id })]);
   expect((await listDecisions(ids.ravi, ws)).find(d => d.tool === change.name)).toMatchObject({ outcome: 'refused' });
   expect(await snapshot(o.id)).toEqual(before);
  });
 }
});

it('a household can read his request but gets not found for another household or another client site', async () => {
 await withSystem(db => db.query("UPDATE members SET client_kind='household' WHERE workspace_id=$1 AND user_id=$2", [ws, ids.omar]), ids.imran);
 const own = await job(ids.faisal, siteId(4));
 const otherHome = await job(ids.omar, siteId(4));
 // Even a matching creator does not grant access at another client's site.
 const otherClient = await job(ids.faisal, siteId(1));
 expect((await getWorkOrder(ids.faisal, ws, own.id)).id).toBe(own.id);
 for (const hidden of [otherHome, otherClient]) {
  await expect(getWorkOrder(ids.faisal, ws, hidden.id)).rejects.toMatchObject({ status: 404 });
  await expect(getWorkOrderByNumber(ids.faisal, ws, hidden.order_number)).rejects.toMatchObject({ status: 404 });
  const r = await callTool({ user: ids.faisal, ws, scope: 'write', kind: 'assistant' }, 'get_work_order', { id: hidden.id });
  expect(r).toMatchObject({ isError: true, structuredContent: { error: { code: 'not_found' } } });
 }
});

it('a facility manager sees exactly his client sites through the server tool', async () => {
 const expected = await withUser(ids.imran, async db => (await db.query('SELECT id FROM sites WHERE workspace_id=$1 AND client_id=$2', [ws, ids.harbor])).rows.map(r => r.id).sort());
 const r = await callTool({ user: ids.pranav, ws, scope: 'read', kind: 'agent' }, 'list_sites', {});
 expect(r.isError).toBeUndefined();
 const sites = r.structuredContent!.result as { id: string; client_id: string }[];
 expect(sites.map(s => s.id).sort()).toEqual(expected);
 expect(sites.length).toBeGreaterThan(0);
 expect(sites.every(s => s.client_id === ids.harbor)).toBe(true);
});

it('office staff cannot decide time off or change member roles through services or the assistant', async () => {
 const leave = await requestTimeOff(ids.ravi, ws, { kind: 'leave', starts_on: '2031-06-10' });
 const member = () => withUser(ids.imran, async db => (await db.query('SELECT * FROM members WHERE workspace_id=$1 AND user_id=$2', [ws, ids.ravi])).rows[0]);
 const before = await member();
 await expect(decideTimeOff(ids.nabil, ws, leave.id, { decision: 'approved' })).rejects.toMatchObject({ status: 403 });
 await expect(setMemberRoles(ids.nabil, ws, ids.ravi, { roles: ['admin'] })).rejects.toMatchObject({ status: 403 });
 for (const [name, args, question] of [
  ['decide_time_off', { id: leave.id, decision: 'approved' }, 'Approve Ravi leave'],
  ['set_member_roles', { user_id: ids.ravi, roles: ['admin'] }, 'Make Ravi an admin'],
 ] as const) {
  turn(name, args);
  const r = await ask(ids.nabil, question);
  expect(r.pending_action).toBeUndefined();
  expect(r.offers).toHaveLength(1);
  expect(r.offers[0].label).toMatch(/^Ask /);
 }
 expect(await member()).toEqual(before);
 expect(await withUser(ids.imran, async db => (await db.query('SELECT status FROM time_off WHERE id=$1', [leave.id])).rows[0].status)).toBe('pending');
});

it.each(actors)('%s cannot book a worker on approved leave', async user => {
 const o = await job(ids.faisal, siteId(4), '2031-06-10T06:00:00Z', null);
 await addTimeOff(ids.imran, ws, { user_id: ids.ravi, kind: 'leave', starts_on: '2031-06-10', ends_on: '2031-06-12' });
 const before = await snapshot(o.id);
 const r = await callTool({ user, ws, scope: 'write', kind: 'agent', approved: true }, 'assign_work_order', { id: o.id, assignee_id: ids.ravi, updated_at: version(o) });
 expect(r.isError).toBe(true);
 if ([ids.imran, ids.sam, ids.nabil].includes(user as typeof ids.imran)) {
  expect(r.structuredContent).toMatchObject({ error: { code: 'validation', message: 'Ravi cannot take a job that day. His next free day is Friday, 13 June 2031.' } });
 } else expect(r.structuredContent).toMatchObject({ error: { code: 'forbidden' } });
 expect(await snapshot(o.id)).toEqual(before);
});

it('creation and rescheduling also refuse approved leave in the workspace day', async () => {
 await addTimeOff(ids.imran, ws, { user_id: ids.ravi, kind: 'leave', starts_on: '2031-06-10', ends_on: '2031-06-12' });
 // Dubai midnight falls on the prior UTC date. Check both ends of the leave span.
 for (const scheduled_for of ['2031-06-09T20:30:00Z', '2031-06-12T19:30:00Z']) {
  await expect(createWorkOrder(ids.imran, ws, { title: 'Check the tap', site_id: siteId(1), assignee_id: ids.ravi, scheduled_for })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('His next free day is Friday, 13 June 2031.') });
 }
 const o = await job(ids.imran, siteId(1), '2031-06-13T06:00:00Z');
 const before = await snapshot(o.id);
 await expect(patchWorkOrder(ids.sam, ws, o.id, { scheduled_for: '2031-06-10', updated_at: version(o) })).rejects.toMatchObject({ status: 422, message: expect.stringContaining('His next free day is Friday, 13 June 2031.') });
 expect(await snapshot(o.id)).toEqual(before);
});

it.each([ids.pranav, ids.kevin, ids.faisal])('%s never sees internal comments through SQL, services or tools', async user => {
 const o = await job(user, user === ids.faisal ? siteId(4) : siteId(1));
 await createComment(ids.imran, ws, o.id, { body: 'Ask Sam about the cost', visibility: 'internal' });
 await createComment(ids.imran, ws, o.id, { body: 'We will call before the visit', visibility: 'client' });
 const internal = await withUser(user, db => db.query("SELECT id FROM comments WHERE work_order_id=$1 AND visibility='internal'", [o.id]));
 expect(internal.rows).toEqual([]);
 const detail = await getWorkOrder(user, ws, o.id);
 const result = await callTool({ user, ws, scope: 'read', kind: 'agent' }, 'get_work_order', { id: o.id });
 expect(result.isError).toBeUndefined();
 for (const order of [detail, result.structuredContent!.result as typeof detail]) {
  expect(order.comments.map((c: any) => c.body)).toEqual(['We will call before the visit']);
  expect(JSON.stringify(order)).not.toContain('Ask Sam about the cost');
 }
});

it('Connect AI cannot queue admin changes from a supervisor or office staff', async () => {
 const o = await job();
 const before = await snapshot(o.id);
 const mode = await withSystem(async db => (await db.query('SELECT approval_mode FROM workspaces WHERE id=$1', [ws])).rows[0].approval_mode, ids.imran);
 await withSystem(db => db.query("UPDATE workspaces SET approval_mode='every' WHERE id=$1", [ws]), ids.imran);
 try {
  const changes: [string, unknown][] = [
   ['set_job_payment', { id: o.id, payment_status: 'paid' }],
   ['set_approval_mode', { approval_mode: 'important' }],
   ['set_member_roles', { user_id: ids.ravi, roles: ['admin'] }],
   ['rename_role', { role: 'technician', name: 'Fixer' }],
   ['create_client', { name: 'Karim' }],
   ['update_client', { id: ids.harbor, name: 'Karim' }],
   ['create_site', { client_id: ids.harbor, name: 'Karim House' }],
   ['update_site', { id: siteId(1), name: 'Karim House' }],
  ];
  for (const user of [ids.sam, ids.nabil]) for (const [name, args] of changes) {
   const r = await callTool({ user, ws, scope: 'write', kind: 'agent' }, name, args);
   expect(r, name).toMatchObject({ isError: true, structuredContent: { error: { code: 'forbidden' } } });
  }
  expect(await snapshot(o.id)).toEqual(before);
  for (const user of [ids.sam, ids.nabil]) {
   const actions = await withUser(user, async db => (await db.query('SELECT id FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND NOT (id=ANY($3::uuid[]))', [ws, user, baseline.assistant_actions])).rows);
   expect(actions).toEqual([]);
   const approvals = await withUser(ids.imran, async db => (await db.query('SELECT id FROM company_action_approvals WHERE workspace_id=$1 AND requested_by=$2', [ws, user])).rows);
   expect(approvals).toEqual([]);
  }
 } finally {
  await withSystem(db => db.query('UPDATE workspaces SET approval_mode=$2 WHERE id=$1', [ws, mode]), ids.imran);
 }
});
