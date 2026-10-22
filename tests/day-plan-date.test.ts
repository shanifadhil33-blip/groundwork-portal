import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn(), away: vi.fn(), role: 'admin', staff: null as string | null }));
vi.mock('../lib/db', () => ({ withSystem: (callback: (db: unknown) => unknown) => callback({ query: state.query }) }));
vi.mock('../lib/services/time-off', () => ({ offReason: state.away }));
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn() }));
import { getDayPlan, postDayPlan } from '../lib/services/day-plan';
import { readTeamPlan } from '../lib/day-plan';
const user = '10000000-0000-4000-8000-000000000001';
const ws = '20000000-0000-4000-8000-000000000001';
beforeEach(() => {
 state.role = 'admin'; state.staff = null; state.away.mockReset().mockResolvedValue(null); state.query.mockReset();
 state.query.mockImplementation(async (sql: string) => {
  if (sql.includes('SELECT role,staff_kind')) return { rows: [{ role: state.role, staff_kind: state.staff }] };
  if (sql.includes('SELECT timezone')) return { rows: [{ timezone: 'Asia/Dubai', today: '2026-10-22', tomorrow: '2026-10-23', is_demo: false, currency: 'AED' }] };
  if (sql.includes('SELECT m.user_id')) return { rows: [{ user_id: user, name: 'Ravi', trades: [], areas: [] }] };
  if (sql.includes('SELECT w.id')) return { rows: [
   { id: 'open', order_number: 1, title: 'Tap', status: 'open', assignee_id: null, day: null, hour: null },
   { id: 'booked', order_number: 2, status: 'scheduled', assignee_id: user, day: '2026-10-22', hour: 8 },
  ] };
  return { rows: [] };
 });
});
it('uses the requested date for availability and bookings, and writes only on approval', async () => {
 const today = await getDayPlan(user, ws);
 const tomorrow = await getDayPlan(user, ws, 'tomorrow');
 expect(today.lines[0].hour).toBe(10); expect(tomorrow.lines[0].hour).toBe(8);
 expect(tomorrow.today).toBe('2026-10-23');
 expect(state.away).toHaveBeenCalledWith(expect.anything(), ws, user, '2026-10-23');
 expect(state.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
 await postDayPlan(user, ws, { action: 'approve', date: tomorrow.today, fingerprint: tomorrow.fingerprint });
 const update = state.query.mock.calls.find(([sql]) => sql.startsWith('UPDATE work_orders'));
 expect(update?.[1][3]).toBe('2026-10-23T04:00:00.000Z');
});
it('refuses changed dates, changed availability and expired dates before writing', async () => {
 const tomorrow = await getDayPlan(user, ws, 'tomorrow');
 await expect(postDayPlan(user, ws, { action: 'approve', date: '2026-10-22', fingerprint: tomorrow.fingerprint })).rejects.toMatchObject({ status: 409 });
 state.away.mockResolvedValue('Ravi is off that day.');
 await expect(postDayPlan(user, ws, { action: 'approve', date: tomorrow.today, fingerprint: tomorrow.fingerprint })).rejects.toMatchObject({ status: 409 });
 await expect(postDayPlan(user, ws, { action: 'approve', date: '2026-10-21', fingerprint: tomorrow.fingerprint })).rejects.toMatchObject({ status: 409 });
 expect(state.query.mock.calls.some(([sql]) => /INSERT|UPDATE|DELETE/.test(sql))).toBe(false);
});
it.each([['technician', null], ['client', null], ['staff', 'office']])('keeps %s approval permissions', async (role, staff) => {
 state.role = role!; state.staff = staff;
 expect((await getDayPlan(user, ws, 'tomorrow')).can_plan).toBe(false);
 await expect(postDayPlan(user, ws, { action: 'preview', date: '2026-10-23' })).rejects.toMatchObject({ status: 403 });
});
it.each(['Do not plan tomorrow for everyone', 'Plan tomorrow for Ravi', 'Schedule WO 58 tomorrow', 'Can everyone work tomorrow?', 'لا تخطط بكرة لكل الفنيين', 'कल सब के लिए योजना मत बनाओ', 'کل سب کے لیے پلان نہ بناؤ'])('leaves unrelated or negative requests alone: %s', text => {
 expect(readTeamPlan(text)).toBeNull();
});

it.each([
 ['Schedule all technicians for tomorrow','tomorrow'],
 ['Plan everyone today','today'],
 ['कल सभी तकनीशियनों के लिए योजना बनाओ','tomorrow'],
 ['تمام ٹیکنیشنز کے لیے آج کا منصوبہ بنائیں','today'],
])('also recognizes alternate word order: %s', (text, day) => {
 expect(readTeamPlan(text)?.day).toBe(day);
});
