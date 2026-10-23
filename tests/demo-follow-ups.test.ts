import { afterAll, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn(async () => 0), pushJobChange: vi.fn(), office: vi.fn(async () => []) }));
import { closePools, withSystem, withUser } from '../lib/db';
import { ids, siteId } from '../lib/fixture';
import { demoJobTranslations } from '../lib/demo-job-copy';
import { DEMO_PROOF_COPY } from '../lib/demo-proof-copy';
import { startDemo, resetDemo } from '../lib/services/demo';
import { getWorkOrder } from '../lib/services/work-orders';
import { jobNextStep, prepareJobNextStep, confirmJobNextStep, returnSlots } from '../lib/services/job-next-step';
import { getJobClose, signOffJob, keepDraft } from '../lib/services/job-close';
import { draftCost } from '../lib/job-close';
import { saveJobReport } from '../lib/services/job-report';
import { sendPush, pushJobChange } from '../lib/services/push';

afterAll(closePools);
const rows = (sql: string, args: unknown[] = []) => withSystem(async db => (await db.query(sql, args)).rows);
async function people(ws: string) {
  const users = Object.fromEntries((await rows('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1', [ws])).map(u => [u.demo_persona, u.id])) as Record<string, string>;
  const jobs = await rows('SELECT * FROM work_orders WHERE workspace_id=$1 ORDER BY order_number', [ws]);
  return { ws, users, pending: jobs.find(j => j.order_number === 62)!, source: jobs.find(j => j.order_number === 63)!,
    follow: jobs.find(j => j.order_number === 64)!, home: jobs.find(j => j.order_number === 65)!, fixed: jobs.find(j => j.order_number === 66)! };
}
async function sandbox() { return people((await startDemo({ persona: 'imran' }, 'local-follow-up-tests')).body.workspace_id); }
async function prepare(user: string, ws: string, job: string, action: string, extra = {}) {
  return (await prepareJobNextStep(user, ws, job, { action, ...extra })).pending_action.id;
}
const get = async (id: string) => (await rows('SELECT * FROM work_orders WHERE id=$1', [id]))[0];

it('D3 seeds linked reports, a waiting return, an own missed visit and an unsigned priced repair only in demo', async () => {
  const real = async () => JSON.stringify(await rows('SELECT * FROM work_orders WHERE workspace_id=$1 ORDER BY id', [ids.ridgeline]));
  const before = await real();
  const s = await sandbox(), u = s.users;
  for (const source of [s.pending, s.source]) {
    expect(source).toMatchObject({ status: 'waiting_on_parts', report_outcome: 'needs_part', report_part: 'Seal', report_by: u.ravi, assignee_id: u.ravi, created_by: u.pranav });
    expect(new Date(source.created_at).getTime()).toBeLessThan(new Date(source.scheduled_for).getTime());
    expect(new Date(source.scheduled_for).getTime()).toBeLessThan(new Date(source.report_at).getTime());
  }
  const pending = await jobNextStep(u.sam, s.ws, s.pending.id);
  expect(pending).toMatchObject({ can_follow: true, follow: null });
  const suggestions = await rows('SELECT * FROM job_suggestions WHERE workspace_id=$1 AND report_follow_up_of IS NOT NULL ORDER BY status DESC', [s.ws]);
  expect(suggestions).toHaveLength(2);
  expect(suggestions.find(d => d.report_follow_up_of === s.pending.id)).toMatchObject({ status: 'pending', work_order_id: null, decided_by: null });
  expect(suggestions.find(d => d.report_follow_up_of === s.source.id)).toMatchObject({ status: 'approved', work_order_id: s.follow.id, decided_by: u.sam });
  expect(s.follow).toMatchObject({ follow_up_of: s.source.id, client_id: s.source.client_id, site_id: s.source.site_id, status: 'waiting_on_parts', report_part: 'Seal', assignee_id: u.ravi, scheduled_for: null, part_arrived_at: null, report_outcome: null });
  expect(s.home).toMatchObject({ created_by: u.faisal, source: 'client', assignee_id: u.ravi, status: 'scheduled' });
  expect(await jobNextStep(u.faisal, s.ws, s.home.id)).toMatchObject({ can_book: true, visits: [{ photo_id: null, rebooked_at: null, visited_at: new Date(s.home.scheduled_for) }] });
  expect(s.fixed).toMatchObject({ status: 'done', report_outcome: 'fixed', report_part: 'Seal', report_work: 'Replaced the seal and tested the tap.', signed_off_at: null });
  expect(await rows('SELECT 1 FROM draft_invoices WHERE workspace_id=$1', [s.ws])).toEqual([]);
  expect(await real()).toBe(before);
  for (const table of ['job_visits', 'draft_invoices']) expect(await rows(`SELECT 1 FROM ${table} WHERE workspace_id=$1`, [ids.ridgeline])).toEqual([]);
  expect(await rows('SELECT 1 FROM job_suggestions WHERE workspace_id=$1 AND report_follow_up_of IS NOT NULL', [ids.ridgeline])).toEqual([]);
  expect(sendPush).not.toHaveBeenCalled();
  expect(pushJobChange).not.toHaveBeenCalled();
});

it('D3 Sam confirms once, Ravi confirms part arrival, and booking reaches the client only after confirmation', async () => {
  const s = await sandbox(), u = s.users;
  for (const user of [u.pranav, u.ravi]) await expect(prepare(user, s.ws, s.pending.id, 'follow_up')).rejects.toMatchObject({ status: 403 });
  const approval = await prepare(u.sam, s.ws, s.pending.id, 'follow_up');
  expect((await jobNextStep(u.sam, s.ws, s.pending.id)).follow).toBeNull();
  const approved = await confirmJobNextStep(u.sam, s.ws, approval);
  expect(await get(approved.id)).toMatchObject({ follow_up_of: s.pending.id, status: 'waiting_on_parts', assignee_id: u.ravi });
  await expect(confirmJobNextStep(u.sam, s.ws, approval)).rejects.toMatchObject({ status: 409 });
  const arrival = await prepare(u.ravi, s.ws, s.follow.id, 'part_arrived');
  expect((await get(s.follow.id)).status).toBe('waiting_on_parts');
  await confirmJobNextStep(u.ravi, s.ws, arrival);
  expect(await get(s.follow.id)).toMatchObject({ status: 'open', scheduled_for: null, part_arrived_at: expect.any(Date) });
  const free = await returnSlots(u.ravi, s.ws, s.follow.id);
  expect(free.slots.length).toBeGreaterThan(0);
  const booking = await prepare(u.ravi, s.ws, s.follow.id, 'book', { scheduled_for: free.slots[0] });
  expect((await getWorkOrder(u.pranav, s.ws, s.follow.id)).scheduled_for).toBeNull();
  expect(await rows("SELECT 1 FROM notifications WHERE entity_id=$1 AND kind='job_next_step'", [s.follow.id])).toEqual([]);
  await confirmJobNextStep(u.ravi, s.ws, booking);
  expect(new Date((await getWorkOrder(u.pranav, s.ws, s.follow.id)).scheduled_for).toISOString()).toBe(free.slots[0]);
  expect(await rows("SELECT 1 FROM notifications WHERE entity_id=$1 AND user_id=$2 AND kind='job_next_step'", [s.follow.id, u.pranav])).toHaveLength(1);
  await expect(confirmJobNextStep(u.ravi, s.ws, booking)).rejects.toMatchObject({ status: 409 });
});

it('D3 Faisal can rebook only his own missed visit and a second sandbox has no access', async () => {
  const s = await sandbox(), other = await sandbox(), u = s.users;
  for (const user of [u.pranav, other.users.faisal]) {
    await expect(jobNextStep(user, s.ws, s.home.id)).rejects.toThrow();
    await expect(prepare(user, s.ws, s.home.id, 'book')).rejects.toMatchObject({ status: 403 });
  }
  await expect(jobNextStep(u.faisal, s.ws, s.source.id)).rejects.toThrow();
  await expect(prepare(other.users.sam, s.ws, s.pending.id, 'follow_up')).rejects.toMatchObject({ status: 403 });
  await expect(prepare(u.pranav, s.ws, s.follow.id, 'part_arrived')).rejects.toMatchObject({ status: 403 });
  const free = await returnSlots(u.faisal, s.ws, s.home.id);
  expect(free.slots.length).toBeGreaterThan(0);
  const booking = await prepare(u.faisal, s.ws, s.home.id, 'book', { scheduled_for: free.slots[0] });
  expect((await jobNextStep(u.faisal, s.ws, s.home.id)).can_book).toBe(true);
  await confirmJobNextStep(u.faisal, s.ws, booking);
  expect((await jobNextStep(u.faisal, s.ws, s.home.id)).can_book).toBe(false);
  expect((await rows('SELECT rebooked_at FROM job_visits WHERE work_order_id=$1', [s.home.id]))[0].rebooked_at).toBeInstanceOf(Date);
});

it('D3 sign off creates the exact SAMPLE draft once, hides amounts and leaves Keep to Imran', async () => {
  const s = await sandbox(), u = s.users, other = await sandbox();
  await expect(signOffJob(u.ravi, s.ws, s.fixed.id)).rejects.toMatchObject({ status: 403 });
  await expect(signOffJob(u.faisal, s.ws, s.fixed.id, { stars: 5 })).rejects.toMatchObject({ status: 403 });
  await signOffJob(u.pranav, s.ws, s.fixed.id, { stars: 5 });
  await expect(signOffJob(u.pranav, s.ws, s.fixed.id, { stars: 5 })).rejects.toThrow();
  expect(await getJobClose(u.imran, s.ws, s.fixed.id)).toMatchObject({ signed_off: true, draft: { status: 'waiting', cost: '190.00', can_keep: true,
    lines: [{ label: 'Work reported', detail: 'Replaced the seal and tested the tap.', amount: '150.00' }, { label: 'Part reported', detail: 'Seal', amount: '40.00' }] } });
  for (const user of [u.pranav, u.kevin, u.ravi, u.nabil, u.sam]) {
    expect(await getJobClose(user, s.ws, s.fixed.id)).toMatchObject({ draft: null, card: { cost: null, shown_amount: null } });
    await expect(withUser(user, db => db.query('SELECT 1 FROM draft_invoices WHERE workspace_id=$1', [s.ws]))).rejects.toMatchObject({ code: '42501' });
    await expect(keepDraft(user, s.ws, s.fixed.id)).rejects.toMatchObject({ status: 403 });
  }
  await expect(getJobClose(other.users.imran, s.ws, s.fixed.id)).rejects.toThrow();
  await expect(keepDraft(other.users.imran, s.ws, s.fixed.id)).rejects.toMatchObject({ status: 403 });
  await keepDraft(u.imran, s.ws, s.fixed.id);
  expect((await rows('SELECT status,kept_by FROM draft_invoices WHERE work_order_id=$1', [s.fixed.id]))).toEqual([{ status: 'kept', kept_by: u.imran }]);
  expect(await rows('SELECT 1 FROM draft_invoices WHERE work_order_id=$1', [s.fixed.id])).toHaveLength(1);
  expect(sendPush).not.toHaveBeenCalled();
});

it('D3 reset restores the pending report, waiting part, unrebooked visit and unsigned repair', async () => {
  const s = await sandbox(), u = s.users;
  await confirmJobNextStep(u.ravi, s.ws, await prepare(u.ravi, s.ws, s.follow.id, 'part_arrived'));
  await signOffJob(u.pranav, s.ws, s.fixed.id, { stars: 5 });
  const restored = await people((await resetDemo(u.imran, { confirm: true })).body.workspace_id);
  expect(await rows('SELECT 1 FROM workspaces WHERE id=$1', [s.ws])).toEqual([]);
  for (const table of ['job_visits', 'draft_invoices', 'job_suggestions']) expect(await rows(`SELECT 1 FROM ${table} WHERE workspace_id=$1`, [s.ws])).toEqual([]);
  expect((await jobNextStep(restored.users.sam, restored.ws, restored.pending.id)).can_follow).toBe(true);
  expect((await jobNextStep(restored.users.ravi, restored.ws, restored.follow.id)).can_arrive).toBeTruthy();
  expect((await jobNextStep(restored.users.faisal, restored.ws, restored.home.id)).can_book).toBe(true);
  expect(await getJobClose(restored.users.pranav, restored.ws, restored.fixed.id)).toMatchObject({ signed_off: false, can_sign_off: true, draft: null });
  expect(await rows('SELECT 1 FROM draft_invoices WHERE workspace_id=$1', [restored.ws])).toEqual([]);
});

it('D3 real users retain the ordinary report, follow up, rebook and billing paths', async () => {
  const ws = ids.ridgeline;
  const create = async (creator: string, client: string, site: string) => (await rows(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,created_by,source)
    VALUES($1,$2,$3,'Repair tap','in_progress',$4,$5,'client') RETURNING *`, [ws, client, site, ids.ravi, creator]))[0];
  const source = await create(ids.pranav, ids.harbor, siteId(1));
  await saveJobReport(ids.ravi, ws, source.id, { outcome: 'needs_part', part: 'Seal', updated_at: new Date(source.updated_at).toISOString() });
  const follow = await confirmJobNextStep(ids.sam, ws, await prepare(ids.sam, ws, source.id, 'follow_up'));
  await confirmJobNextStep(ids.ravi, ws, await prepare(ids.ravi, ws, follow.id, 'part_arrived'));
  const slots = await returnSlots(ids.ravi, ws, follow.id);
  await confirmJobNextStep(ids.ravi, ws, await prepare(ids.ravi, ws, follow.id, 'book', { scheduled_for: slots.slots[0] }));
  const home = await create(ids.faisal, ids.northgate, siteId(4));
  await confirmJobNextStep(ids.ravi, ws, await prepare(ids.ravi, ws, home.id, 'no_access'));
  const free = await returnSlots(ids.faisal, ws, home.id);
  await confirmJobNextStep(ids.faisal, ws, await prepare(ids.faisal, ws, home.id, 'book', { scheduled_for: free.slots[0] }));
  expect((await jobNextStep(ids.faisal, ws, home.id)).can_book).toBe(false);
  const fixed = await create(ids.pranav, ids.harbor, siteId(1));
  await saveJobReport(ids.ravi, ws, fixed.id, { outcome: 'fixed', work: 'Replaced the seal and tested the tap.', part: 'Seal', updated_at: new Date(fixed.updated_at).toISOString() });
  await signOffJob(ids.pranav, ws, fixed.id, { stars: 5 });
  const close = await getJobClose(ids.imran, ws, fixed.id);
  expect(close.draft?.cost).toBe('190.00');
  expect(draftCost(close.draft!.lines)).toBe('190.00');
  expect((await getJobClose(ids.ravi, ws, fixed.id)).draft).toBeNull();
  await expect(keepDraft(ids.nabil, ws, fixed.id)).rejects.toMatchObject({ status: 403 });
  await keepDraft(ids.imran, ws, fixed.id);
  expect((await getJobClose(ids.imran, ws, fixed.id)).draft?.status).toBe('kept');
});

it('D3 fixture text has static translations in every language', () => {
  for (const file of readdirSync('public/i18n')) {
    const text = JSON.parse(readFileSync(`public/i18n/${file}`, 'utf8'));
    Object.assign(text, demoJobTranslations(text));
    for (const key of DEMO_PROOF_COPY) expect(text[key], `${file}: ${key}`).toBeTruthy();
  }
});
