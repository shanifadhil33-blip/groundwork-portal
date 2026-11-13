import { afterAll, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
vi.mock('../lib/services/push', () => ({ sendPush: vi.fn(async () => 0), pushJobChange: vi.fn(), office: vi.fn(async () => []) }));
import { closePools, withSystem } from '../lib/db';
import { ids, orderId } from '../lib/fixture';
import { fixturePhotos } from '../lib/fixture-photos';
import { startDemo, resetDemo } from '../lib/services/demo';
import { getWorkOrder } from '../lib/services/work-orders';
import { previousTechnician } from '../lib/services/client-visits';
import { myFixes } from '../lib/services/job-report';
import { getJobClose, signOffJob } from '../lib/services/job-close';
import { getRating } from '../lib/services/ratings';
import { addPhoto, removePhoto, listPhotos, getPhoto, looksLike } from '../lib/services/photos';
import { getSharedPhoto } from '../lib/services/shared-photos';
import { sendPush } from '../lib/services/push';
import { setAuthResolverForTests } from '../lib/auth';
import * as photoRoute from '../app/api/workspaces/[ws]/work-orders/[id]/photos/[photoId]/route';
afterAll(closePools);
const rows = (sql: string, args: unknown[] = [], actor: string | null = null) => withSystem(async db => (await db.query(sql, args)).rows, actor);
async function sandbox() {
  const s = await startDemo({ persona: 'imran' }, 'local-proof-tests');
  return people(s.body.workspace_id);
}
async function people(ws: string) {
  const users = Object.fromEntries((await rows('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1', [ws])).map(u => [u.demo_persona, u.id])) as Record<string, string>;
  const jobs = await rows('SELECT * FROM work_orders WHERE workspace_id=$1 ORDER BY order_number', [ws]);
  return { ws, users, high: jobs.find(j => j.order_number === 18)!, low: jobs.find(j => j.order_number === 24)!, home: jobs.find(j => j.order_number === 61)! };
}

it('D1 seeds coherent reports, private drawings, thanks and a self-created household completion only in demo', async () => {
  const real = async () => JSON.stringify(await rows(`SELECT id,title,description,created_by,assignee_id,status,report_at,signed_off_at FROM work_orders WHERE workspace_id=$1 ORDER BY id`, [ids.ridgeline]));
  const before = await real();
  expect(await rows('SELECT 1 FROM job_photos WHERE workspace_id=$1 UNION ALL SELECT 1 FROM shared_photos WHERE workspace_id=$1 UNION ALL SELECT 1 FROM job_ratings WHERE workspace_id=$1', [ids.ridgeline], ids.imran)).toEqual([]);
  expect(await previousTechnician(ids.faisal, ids.ridgeline)).toBeNull();
  const { ws, users: u, high, home } = await sandbox();
  expect(home).toMatchObject({ source: 'client', created_by: u.faisal, assignee_id: u.ravi, report_by: u.ravi, status: 'done', report_outcome: 'fixed', signed_off_at: null });
  expect(home.client_id).not.toBe(high.client_id);
  expect(new Date(home.created_at).getTime()).toBeLessThan(new Date(home.scheduled_for).getTime());
  expect(new Date(home.scheduled_for).getTime()).toBeLessThan(new Date(home.report_at).getTime());
  expect(new Date(high.report_at).getTime()).toBeLessThan(new Date(high.signed_off_at).getTime());
  expect(high.signed_off_by).toBe(u.pranav);
  for (const job of [high, home]) {
    const timeline = await rows('SELECT actor_id,kind,created_at FROM work_order_events WHERE work_order_id=$1 ORDER BY created_at', [job.id]);
    expect(timeline).toHaveLength(4);
    expect(timeline[0]).toMatchObject({ kind: 'created', actor_id: job.created_by });
    expect(timeline.at(-1)?.actor_id).toBe(u.ravi);
    expect(new Date(timeline[0].created_at).getTime()).toBe(new Date(job.created_at).getTime());
    expect(new Date(timeline.at(-1)!.created_at).getTime()).toBe(new Date(job.report_at).getTime());
  }
  expect((await myFixes(u.ravi, ws, { month: 'all' })).summary.thanks).toBe(1);
  expect((await getRating(u.pranav, ws, high.id)).rating).toMatchObject({ stars: 5, note: 'Thank you for fixing the tap.' });
  expect((await getRating(u.ravi, ws, high.id)).rating).toMatchObject({ stars: 5, note: 'Thank you for fixing the tap.' });
  expect(await getJobClose(u.pranav, ws, high.id)).toMatchObject({ signed_off: true, can_sign_off: false, photos: { before: 1, after: 1 }, card: { shown_amount: 'AED 320.00', problem: 'The tap was leaking.' } });
  expect(await getJobClose(u.faisal, ws, home.id)).toMatchObject({ signed_off: false, can_sign_off: true, card: { shown_amount: 'AED 320.00' } });
  expect((await getRating(u.faisal, ws, home.id)).can_rate).toBe(true);
  expect(await previousTechnician(u.faisal, ws)).toMatchObject({ user_id: u.ravi, name: 'Ravi' });
  const photos = await listPhotos(u.ravi, ws, high.id);
  expect(photos.map(p => p.kind).sort()).toEqual(['after', 'before']);
  for (const p of photos) {
    const image = await getPhoto(u.pranav, ws, high.id, p.id);
    expect(looksLike(image.mime, image.bytes)).toBe(true);
    expect(image.bytes.length).toBeLessThan(2000);
    await expect(getPhoto(u.omar, ws, high.id, p.id)).rejects.toThrow();
  }
  setAuthResolverForTests(async () => u.ravi);
  try {
    const response = await photoRoute.GET(new Request('http://localhost/photo'), { params: Promise.resolve({ ws, id: high.id, photoId: photos[0].id }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('private');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(fixturePhotos[photos[0].kind as 'before' | 'after']);
  } finally { setAuthResolverForTests(); }
  const shared = (await rows('SELECT id FROM shared_photos WHERE workspace_id=$1 AND work_order_id=$2', [ws, home.id]))[0];
  expect((await getSharedPhoto(u.faisal, ws, shared.id)).bytes).toEqual(fixturePhotos.before);
  await expect(getSharedPhoto(u.pranav, ws, shared.id)).rejects.toThrow();
  await expect(getWorkOrder(u.faisal, ws, high.id)).rejects.toThrow();
  expect(await real()).toBe(before);
  expect(sendPush).not.toHaveBeenCalled();
});

it('D1 ordinary privacy rules hide low ratings from Ravi, office staff and other clients', async () => {
  const { ws, users: u, low } = await sandbox();
  expect(low.assignee_id).toBe(u.ravi);
  for (const user of [u.sam, u.imran, u.omar]) expect((await getRating(user, ws, low.id)).rating?.stars).toBe(2);
  for (const user of [u.ravi, u.nabil]) expect(await getRating(user, ws, low.id)).toMatchObject({ rating: null, can_rate: false });
  for (const user of [u.pranav, u.kevin, u.faisal]) await expect(getRating(user, ws, low.id)).rejects.toThrow();
  const other = await sandbox();
  await expect(getRating(other.users.sam, ws, low.id)).rejects.toThrow();
  const p = (await listPhotos(u.sam, ws, (await people(ws)).high.id))[0];
  await expect(getPhoto(other.users.sam, ws, (await people(ws)).high.id, p.id)).rejects.toThrow();
});

it('D1 demo and real photo operations keep the same permissions; household sign off uses the normal path', async () => {
  const s = await sandbox();
  for (const [ws, admin, client, technician, job] of [
    [s.ws, s.users.sam, s.users.pranav, s.users.ravi, s.high.id],
    [ids.ridgeline, ids.sam, ids.pranav, ids.ravi, orderId(18)],
  ]) {
    const photo = await addPhoto(admin, ws, job, { kind: 'after', mime: 'image/webp', data: fixturePhotos.after.toString('base64'), width: 256, height: 160 });
    expect(Buffer.from(Object.values((await getPhoto(client, ws, job, photo.id)).bytes))).toEqual(fixturePhotos.after);
    await expect(addPhoto(client, ws, job, { kind: 'after', mime: 'image/webp', data: fixturePhotos.after.toString('base64'), width: 256, height: 160 })).rejects.toThrow();
    await expect(removePhoto(technician, ws, job, photo.id)).rejects.toThrow();
    await removePhoto(admin, ws, job, photo.id);
    await expect(getPhoto(client, ws, job, photo.id)).rejects.toThrow();
  }
  await signOffJob(s.users.faisal, s.ws, s.home.id, { stars: 5, thanks: 'Thank you for fixing the tap.' });
  expect((await getJobClose(s.users.faisal, s.ws, s.home.id)).signed_off).toBe(true);
  await expect(signOffJob(s.users.faisal, s.ws, s.home.id, { stars: 5 })).rejects.toThrow();
  // Real technicians also read thanks on their own jobs.
  await signOffJob(ids.pranav, ids.ridgeline, orderId(18), { stars: 5 });
  expect((await getRating(ids.pranav, ids.ridgeline, orderId(18))).rating?.stars).toBe(5);
  expect((await getRating(ids.ravi, ids.ridgeline, orderId(18))).rating?.stars).toBe(5);
  expect((await myFixes(ids.ravi, ids.ridgeline)).summary.thanks).toBe(1);
});

it('D1 reset removes edited evidence and restores just the initial sample rows', async () => {
  const s = await sandbox();
  await removePhoto(s.users.sam, s.ws, s.high.id, (await listPhotos(s.users.sam, s.ws, s.high.id))[0].id);
  await signOffJob(s.users.faisal, s.ws, s.home.id, { stars: 5 });
  const reset = await resetDemo(s.users.imran, { confirm: true });
  const restored = await people(reset.body.workspace_id);
  expect(restored.ws).not.toBe(s.ws);
  expect(await rows('SELECT 1 FROM workspaces WHERE id=$1', [s.ws])).toEqual([]);
  for (const [table, count] of [['job_photos', 4], ['shared_photos', 1], ['job_ratings', 2]] as const) {
    expect((await rows(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id=$1`, [restored.ws], restored.users.imran))[0].n).toBe(count);
    expect((await rows(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id=$1`, [s.ws]))[0].n).toBe(0);
  }
  expect(await previousTechnician(restored.users.faisal, restored.ws)).toMatchObject({ user_id: restored.users.ravi });
});

it('D1 sample copy is present in all language files', () => {
  const keys = ['Fix the leaking pantry tap', 'The pantry tap drips all day.', 'The tap was leaking.', 'Replaced the seal and tested the tap.', 'Thank you for fixing the tap.', 'Please check this repair again.'];
  for (const file of readdirSync('public/i18n')) {
    const text = JSON.parse(readFileSync(`public/i18n/${file}`, 'utf8'));
    for (const key of keys) expect(text[key], `${file}: ${key}`).toBeTruthy();
  }
});
