import { afterAll, beforeAll, expect, it, vi } from 'vitest';
const sent: { endpoint: string; body: { title: string } }[] = [];
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async (s: { endpoint: string }, body: string) => { sent.push({ endpoint: s.endpoint, body: JSON.parse(body) }); return {}; } } }));
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { BURST_LIMIT, sendPush, subscribePush } from '../lib/services/push';
import { groupNotifications } from '../lib/ui/notifications';
const ep = 'https://push.example.test/burst/' + ids.nabil, key = 'B'.repeat(40);
beforeAll(async () => { process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv'; await subscribePush(ids.nabil, { endpoint: ep, keys: { p256dh: key, auth: 'authauth' } }); });
afterAll(async () => { await withSystem(db => db.query('DELETE FROM push_subscriptions WHERE endpoint=$1', [ep])); await closePools(); });
it('CMP08: a burst becomes one summary, then stays quiet; urgent still goes', async () => {
  for (let i = 0; i < BURST_LIMIT + 4; i++) await sendPush([ids.nabil], { title: 'Job ' + i, body: 'b', url: '/', tag: 't' + i });
  const mine = sent.filter(s => s.endpoint === ep);
  expect(mine.length).toBe(BURST_LIMIT + 1); expect(mine.at(-1)!.body.title).toBe('More job updates');
  await sendPush([ids.nabil], { title: 'Gas leak', body: 'b', url: '/', tag: 'u', urgent: true });
  expect(sent.filter(s => s.endpoint === ep).at(-1)!.body.title).toBe('Gas leak');
  await withSystem(db => db.query("UPDATE push_subscriptions SET burst_start=now()-interval '11 minutes' WHERE endpoint=$1", [ep]));
  await sendPush([ids.nabil], { title: 'Later', body: 'b', url: '/', tag: 'l' });
  expect(sent.filter(s => s.endpoint === ep).at(-1)!.body.title).toBe('Later');
});
it('CMP08: updates on one job group into one row', () => {
  const n = (id: string, job: string | null) => ({ id, read_at: null, link_target: job ? { entity: 'work_orders', id: job } : null });
  const g = groupNotifications([n('1', 'a'), n('2', 'b'), n('3', 'a'), n('4', null), n('5', 'a')]);
  expect(g.map(x => x.item.id)).toEqual(['1', '2', '4']); expect(g[0].rest.map(x => x.id)).toEqual(['3', '5']);
});
