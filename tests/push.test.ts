import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
const sent: { endpoint: string; body: { title: string; tag?: string } }[] = []; let fail: Record<string, number> = {};
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async (s: { endpoint: string }, body: string) => { if (fail[s.endpoint]) throw Object.assign(new Error('gone'), { statusCode: fail[s.endpoint] }); sent.push({ endpoint: s.endpoint, body: JSON.parse(body) }); } } }));
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { pushJobChange, pushLateJobs, pushStatus, sendPush, subscribePush, unsubscribePush } from '../lib/services/push';
import { patchWorkOrder, getWorkOrder } from '../lib/services/work-orders';
import { tools } from '../lib/agent/tools';
const key = 'B'.repeat(40), ep = (u: string) => `https://push.example/${u}`;
beforeAll(async () => { process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv'; for (const u of [ids.imran, ids.sam, ids.ravi, ids.omar, ids.pranav]) await subscribePush(u, { endpoint: ep(u), keys: { p256dh: key, auth: 'authauth' } }); });
beforeEach(() => { sent.length = 0; fail = {}; });
afterAll(async () => { await withSystem(db => db.query("DELETE FROM push_subscriptions WHERE endpoint LIKE 'https://push.example/%'")); await closePools(); });
const to = () => sent.map(s => s.endpoint.split('/').pop()).sort();
describe('web push', () => {
  it('a person sees only his own devices, and off removes the device', async () => {
    expect((await pushStatus(ids.ravi)).devices).toBe(1);
    await subscribePush(ids.ravi, { endpoint: ep('ravi2'), keys: { p256dh: key, auth: 'authauth' } }); expect((await pushStatus(ids.ravi)).devices).toBe(2);
    await unsubscribePush(ids.imran, { endpoint: ep('ravi2') }); expect((await pushStatus(ids.ravi)).devices).toBe(2); // not his device
    await unsubscribePush(ids.ravi, { endpoint: ep('ravi2') }); expect((await pushStatus(ids.ravi)).devices).toBe(1);
    await expect(subscribePush(ids.ravi, { endpoint: 'http://insecure.example/x', keys: { p256dh: key, auth: 'authauth' } })).rejects.toThrow();
  });
  it('the same browser moves to whoever turned it on last', async () => {
    await subscribePush(ids.sam, { endpoint: ep('shared'), keys: { p256dh: key, auth: 'authauth' } });
    await subscribePush(ids.ravi, { endpoint: ep('shared'), keys: { p256dh: key, auth: 'authauth' } });
    const owner = (await withSystem(db => db.query('SELECT user_id FROM push_subscriptions WHERE endpoint=$1', [ep('shared')]))).rows;
    expect(owner).toEqual([{ user_id: ids.ravi }]);
    await unsubscribePush(ids.ravi, { endpoint: ep('shared') });
  });
  it('assigning a job tells only the new assignee, never the person who did it', async () => {
    const j = (await withSystem(db => db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') AND (assignee_id IS NULL OR assignee_id<>$2) LIMIT 1", [ids.ridgeline, ids.ravi]))).rows[0];
    const o = await getWorkOrder(ids.imran, ids.ridgeline, j.id);
    await patchWorkOrder(ids.imran, ids.ridgeline, j.id, { assignee_id: ids.ravi, updated_at: new Date(o.updated_at).toISOString() });
    expect(to()).toEqual([ids.ravi]); expect(sent[0].body.title).toBe('New job for you');
    sent.length = 0; const o2 = await getWorkOrder(ids.imran, ids.ridgeline, j.id);
    await patchWorkOrder(ids.imran, ids.ridgeline, j.id, { title: o2.title + ' ', updated_at: new Date(o2.updated_at).toISOString() });
    expect(sent).toEqual([]); // same assignee again: no repeat
  });
  it('a done job tells the office and the client who asked, not the person who finished it', async () => {
    const base = { id: 'x', workspace_id: ids.ridgeline, title: 'Fix tap', assignee_id: ids.ravi, client_id: (await withSystem(db => db.query("SELECT client_id FROM members WHERE user_id=$1 AND workspace_id=$2", [ids.omar, ids.ridgeline]))).rows[0].client_id };
    await pushJobChange(ids.ravi, { ...base, status: 'in_progress' }, { ...base, status: 'done', created_by: ids.omar });
    expect(to()).toEqual([ids.imran, ids.omar, ids.sam].sort()); expect(sent.find(x => x.body.title === 'Job done')).toBeTruthy(); expect(sent.filter(x => x.body.tag === `status-x`).length).toBe(1); // the asker gets one update in their language, not two
    sent.length = 0; await pushJobChange(ids.ravi, { ...base, status: 'done' }, { ...base, status: 'done', created_by: ids.omar }); expect(sent).toEqual([]);
    sent.length = 0; await pushJobChange(ids.imran, { ...base, status: 'in_progress' }, { ...base, status: 'done', created_by: ids.pranav }); expect(to()).not.toContain(ids.pranav); // client of another company never hears
  });
  it('late jobs: due yesterday and not done, to the assignee and the office', async () => {
    const r = await pushLateJobs();
    const want = (await withSystem(db => db.query("SELECT count(*)::int n FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE w.status NOT IN ('done','cancelled') AND w.due_on=(CURRENT_TIMESTAMP AT TIME ZONE s.timezone)::date-1 AND s.demo_expires_at IS NULL"))).rows[0].n;
    expect(r.late).toBe(want); for (const s of sent) expect(s.body.title).toBe('Job late');
  });
  it('a dead device is removed, other errors are kept, and with no keys nothing is sent', async () => {
    await subscribePush(ids.sam, { endpoint: ep('dead'), keys: { p256dh: key, auth: 'authauth' } }); fail[ep('dead')] = 410;
    await sendPush([ids.sam], { title: 't', body: 'b', url: '/', tag: 't' });
    expect((await withSystem(db => db.query('SELECT 1 FROM push_subscriptions WHERE endpoint=$1', [ep('dead')]))).rowCount).toBe(0);
    process.env.VAPID_PRIVATE_KEY = ''; expect(await sendPush([ids.sam], { title: 't', body: 'b', url: '/', tag: 't' })).toBe(0); process.env.VAPID_PRIVATE_KEY = 'priv';
    expect(tools.notification_status.write).toBe(false);
  });
});
