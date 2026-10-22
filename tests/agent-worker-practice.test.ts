import { beforeEach, expect, it, vi } from 'vitest';
import { PRACTICE_CODE, PRACTICE_NOTICE, PRACTICE_TOKEN } from '../lib/identity-rehearsal';

const state = vi.hoisted(() => ({ query: vi.fn(), issuer: vi.fn(), realUser: vi.fn(), ai: vi.fn(), role: 'admin', staffKind: null as string | null, expires: '2099-01-01T00:00:00.000Z' }));
vi.mock('../lib/ai', () => ({ assistantTurn: state.ai }));
vi.mock('../lib/db', () => ({ withSystem: state.issuer, withUser: vi.fn(), asAgent: (_: unknown, fn: () => unknown) => fn(), appPool: {}, ownerPool: {} }));
vi.mock('../lib/services/demo', () => ({ assertRealUser: state.realUser }));
vi.mock('../lib/services/shared', async original => ({
  ...await original<typeof import('../lib/services/shared')>(),
  inWorkspace: async (user: string, ws: string, fn: (c: unknown) => unknown) => fn({ user, ws, role: state.role, staff_kind: state.staffKind, db: { query: state.query } }),
}));
import { callTool } from '../lib/agent/tools';
import { addFieldWorker } from '../lib/services/field-signin';

const user = '10000000-0000-4000-8000-000000000001';
const ws = '20000000-0000-4000-8000-000000000001';
const context = { user, ws, scope: 'write', kind: 'assistant', approved: true } as const;
beforeEach(() => {
  vi.clearAllMocks();
  state.role = 'admin'; state.staffKind = null; state.expires = '2099-01-01T00:00:00.000Z';
  state.query.mockImplementation(async (sql: string, values: unknown[]) => {
    expect(sql).toBe('SELECT is_demo,demo_expires_at FROM workspaces WHERE id=$1');
    expect(values).toEqual([ws]);
    return { rows: [{ is_demo: true, demo_expires_at: state.expires }] };
  });
  state.issuer.mockImplementation(() => { throw new Error('Real issuer must not run'); });
  state.realUser.mockImplementation(() => { throw new Error('Real issuance path must not run'); });
});

it.each(['admin', 'staff'])('the %s tool returns exactly the Team practice receipt without entering real issuance', async role => {
  state.role = role;
  const args = { name: 'Yusuf', phone: '+971 50 000 0000', role: 'technician' };
  const team = await addFieldWorker(user, ws, args);
  const result = await callTool(context, 'add_worker', args);
  expect(team).toEqual({ simulated: true, name: 'Yusuf', role: 'technician', token: PRACTICE_TOKEN, code: PRACTICE_CODE, notice: PRACTICE_NOTICE, expires_at: state.expires });
  expect(result).toEqual({ content: [{ type: 'text', text: JSON.stringify(team) }], structuredContent: { result: team } });
  expect(state.realUser).not.toHaveBeenCalled();
  expect(state.issuer).not.toHaveBeenCalled();
  expect(state.ai).not.toHaveBeenCalled();
});

it.each([
  ['staff', null, 'staff'],
  ['staff', 'office', 'technician'],
  ['technician', null, 'technician'],
  ['client', null, 'technician'],
])('refuses role %s kind %s adding %s before any issuance', async (role, staffKind, target) => {
  state.role = role; state.staffKind = staffKind;
  const result = await callTool(context, 'add_worker', { name: 'Yusuf', role: target });
  expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'forbidden' } } });
  expect(state.query).not.toHaveBeenCalled();
  expect(state.realUser).not.toHaveBeenCalled();
  expect(state.issuer).not.toHaveBeenCalled();
});

it('an expired demo never falls through to real issuance', async () => {
  state.expires = '2000-01-01T00:00:00.000Z';
  const result = await callTool(context, 'add_worker', { name: 'Yusuf' });
  expect(result).toMatchObject({ isError: true, structuredContent: { error: { code: 'demo_ended' } } });
  expect(state.realUser).not.toHaveBeenCalled();
  expect(state.issuer).not.toHaveBeenCalled();
});
