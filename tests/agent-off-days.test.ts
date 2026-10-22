import { beforeEach, expect, it, vi } from 'vitest';
import { LANGUAGES } from '../lib/languages';
import { choiceWords } from '../lib/agent/choices';
const state = vi.hoisted(() => ({ query: vi.fn(), update: vi.fn(), ai: vi.fn(), language: 'en-IN', weekly: true, kind: null as string | null, next: '2026-10-25', date: '2026-10-24' }));
const user = '10000000-0000-4000-8000-000000000001';
const ws = '20000000-0000-4000-8000-000000000001';
const anil = '10000000-0000-4000-8000-000000000003';
const id = '50000000-0000-4000-8000-000000000001';
const version = '2026-10-22T08:00:00.000Z';
const order = () => ({ id, status: 'scheduled', assignee_id: anil, scheduled_for: '2026-10-23T21:00:00Z', updated_at: new Date(version) });
vi.mock('../lib/ai', () => ({ assistantTurn: state.ai }));
vi.mock('../lib/db', () => ({ withSystem: vi.fn(() => { throw new Error('No owner connection expected'); }), withUser: vi.fn(), asAgent: (_: unknown, fn: () => unknown) => fn(), appPool: {}, ownerPool: {} }));
vi.mock('../lib/services/shared', async original => ({
  ...await original<typeof import('../lib/services/shared')>(),
  inWorkspace: async (actor: string, workspace: string, fn: (c: unknown) => unknown) => fn({ user: actor, ws: workspace, role: 'staff', client_id: null, db: { query: state.query } }),
  row: async () => order(), update: state.update,
}));
vi.mock('../lib/services/push', () => ({ pushJobChange: vi.fn(), pushOnTheWay: vi.fn(), sendPush: vi.fn() }));
import { assertWorking, offReason } from '../lib/services/time-off';
import { patchWorkOrder } from '../lib/services/work-orders';
import { callTool } from '../lib/agent/tools';
import type { Context } from '../lib/services/shared';
const context = () => ({ user, ws, role: 'staff', client_id: null, db: { query: state.query } }) as unknown as Context;
const source = '{name} cannot take a job that day. His next free day is {day}.';
const expected = () => choiceWords(state.language)(source).replace('{name}', 'Anil').replace('{day}', new Intl.DateTimeFormat(state.language === 'tw' ? 'ak' : state.language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${state.next}T00:00:00Z`)));
beforeEach(() => {
  vi.clearAllMocks(); state.language = 'en-IN'; state.weekly = true; state.kind = null; state.next = '2026-10-25'; state.date = '2026-10-24';
  state.update.mockImplementation(async (_c, _table, _id, data) => ({ ...order(), ...data }));
  state.query.mockImplementation(async (sql: string) => {
    if (sql.includes('AS weekly')) return { rows: [{ weekly: state.weekly, kind: state.kind, name: 'Anil' }] };
    if (sql.includes('WITH anchors')) return { rows: [{ d: state.next }] };
    if (sql.includes('AT TIME ZONE timezone)::date')) return { rows: [{ d: state.date }] };
    if (sql.includes('SELECT language')) return { rows: [{ language: state.language }] };
    if (sql.includes('SELECT name FROM visible_user')) return { rows: [{ name: 'Anil' }] };
    if (sql.includes('SELECT 1 FROM members')) return { rows: [{}], rowCount: 1 };
    return { rows: [], rowCount: 0 };
  });
});
it('refuses the direct assignment to Anil on Saturday in the workspace timezone, without writing', async () => {
  await expect(patchWorkOrder(user, ws, id, { assignee_id: anil, updated_at: version })).rejects.toMatchObject({ status: 422, message: expected(), fields: { assignee_id: [expected()] } });
  expect(state.query).toHaveBeenCalledWith(expect.stringContaining('AS weekly'), [ws, anil, '2026-10-24']);
  expect(state.query).toHaveBeenCalledWith(expect.stringContaining('AT TIME ZONE timezone'), ['2026-10-23T21:00:00Z', ws]);
  expect(state.update).not.toHaveBeenCalled(); expect(state.ai).not.toHaveBeenCalled();
});
it.each(LANGUAGES.map(l => l.code))('agent assignment refuses in %s using the saved language and a named next day', async language => {
  state.language = language;
  const result = await callTool({ user, ws, scope: 'write', kind: 'assistant', approved: true }, 'assign_work_order', { id, assignee_id: anil, updated_at: version });
  expect(result).toMatchObject({ isError: true, content: [{ text: expected() }], structuredContent: { error: { message: expected() } } });
  expect(state.update).not.toHaveBeenCalled(); expect(state.ai).not.toHaveBeenCalled();
});
it.each(['leave', 'sick', 'off'])('rescheduling through agent tools also refuses approved %s', async kind => {
  state.weekly = false; state.kind = kind; state.next = '2026-11-02'; state.language = 'hi';
  const result = await callTool({ user, ws, scope: 'write', kind: 'assistant', approved: true }, 'update_work_order_dates', { id, scheduled_for: '2026-10-24T05:00:00Z', updated_at: version });
  expect(result).toMatchObject({ isError: true, content: [{ text: expected() }] });
  expect(state.update).not.toHaveBeenCalled();
});
it('queries approved leave and weekly off days without a fixed date horizon', async () => {
  state.kind = 'leave'; state.next = '2028-11-05';
  await expect(assertWorking(context(), anil, order().scheduled_for)).rejects.toMatchObject({ message: expected() });
  const [sql, values] = state.query.mock.calls.find(([sql]) => sql.includes('WITH anchors'))!;
  expect(values).toEqual([ws, anil, state.date]);
  expect(sql).toContain('SELECT ends_on FROM time_off'); expect(sql).toContain("status='approved'");
  expect(sql).toContain('ANY(m.off_days)'); expect(sql).toContain('d BETWEEN t.starts_on AND t.ends_on');
  expect(sql).toContain('ORDER BY d LIMIT 1');
});
it('keeps working days available, and retains the existing skip for unassigned or undated jobs', async () => {
  state.weekly = false;
  await expect(patchWorkOrder(user, ws, id, { assignee_id: anil, updated_at: version })).resolves.toMatchObject({ assignee_id: anil });
  expect(state.update).toHaveBeenCalledTimes(1);
  state.query.mockClear();
  await assertWorking(context(), null, order().scheduled_for); await assertWorking(context(), anil, null);
  expect(state.query).not.toHaveBeenCalled();
});
it('only approved leave blocks work and a pending request does not produce an off reason', async () => {
  state.weekly = false;
  await expect(offReason(context().db, ws, anil, state.date)).resolves.toBeNull();
  expect(state.query.mock.calls[0][0]).toContain("t.status='approved'");
});

it.each(['assistant', 'agent'] as const)('refuses a confirmed %s action during approved leave', async kind => {
  state.weekly = false; state.kind = 'leave'; state.language = 'ar-AE'; state.next = '2026-11-02';
  const result = await callTool({ user, ws, scope: 'write', kind, approved: true }, 'assign_work_order', { id, assignee_id: anil, updated_at: version });
  expect(result).toMatchObject({ isError: true, content: [{ text: expected() }] });
  expect(state.update).not.toHaveBeenCalled(); expect(state.ai).not.toHaveBeenCalled();
});
it('refuses the direct path during leave with the same localized next day', async () => {
  state.weekly = false; state.kind = 'leave'; state.language = 'ur'; state.next = '2026-11-02';
  await expect(patchWorkOrder(user, ws, id, { assignee_id: anil, updated_at: version })).rejects.toMatchObject({ status: 422, message: expected() });
  expect(state.update).not.toHaveBeenCalled();
});
it('ships the refusal in all language files with both values preserved', () => {
  for (const { code } of LANGUAGES.filter(l => !l.code.startsWith('en'))) {
    const text = choiceWords(code)(source);
    expect(text, code).not.toBe(source);
    expect(text, code).toContain('{name}'); expect(text, code).toContain('{day}');
  }
});

it('uses Twi day and month names rather than the English ICU fallback', async () => {
  state.language = 'tw';
  await expect(assertWorking(context(), anil, order().scheduled_for)).rejects.toMatchObject({ message: expected() });
  expect(expected()).not.toMatch(/Sunday|October/);
});
