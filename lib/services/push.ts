import webpush from 'web-push';
import { z } from 'zod';
import { withSystem, withUser } from '../db';
import { ApiError } from '../http';

/** Free web push (VAPID). Keys live in Vercel env; without them push is simply off. */
const keys = () => { const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY; return pub && priv ? { pub, priv } : null; };
export function pushPublicKey() { return { key: keys()?.pub ?? null }; }

const sub = z.object({ endpoint: z.url().startsWith('https://').max(1000), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }), device: z.string().max(120).optional() });
export async function pushStatus(user: string) { return withUser(user, async db => ({ devices: (await db.query('SELECT count(*)::int n FROM push_subscriptions WHERE user_id=$1', [user])).rows[0].n as number, ready: !!keys() })); }
export async function subscribePush(user: string, body: unknown) {
  if (!keys()) throw new ApiError(503, 'push_off', 'Notifications are not set up yet. Try again later.');
  const s = sub.parse(body);
  // The same browser may come back under another person: the device now belongs to whoever turned it on last.
  await withSystem(db => db.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id<>$2', [s.endpoint, user]));
  await withUser(user, db => db.query(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,device) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, device=EXCLUDED.device`, [user, s.endpoint, s.keys.p256dh, s.keys.auth, s.device ?? null]));
  return { on: true };
}
export async function unsubscribePush(user: string, body: unknown) {
  const { endpoint } = z.object({ endpoint: z.string().max(1000) }).parse(body);
  await withUser(user, db => db.query('DELETE FROM push_subscriptions WHERE user_id=$1 AND endpoint=$2', [user, endpoint]));
  return { on: false };
}

type Msg = { title: string; body: string; url: string; tag: string };
/** Send to every device of these people. Dead devices (404/410) are removed. Never throws. */
export async function sendPush(users: string[], msg: Msg) {
  const k = keys(); const list = [...new Set(users)].filter(Boolean); if (!k || !list.length) return 0;
  try {
    webpush.setVapidDetails('mailto:shanifadhil33@gmail.com', k.pub, k.priv);
    const subs = (await withSystem(db => db.query('SELECT id,endpoint,p256dh,auth FROM push_subscriptions WHERE user_id = ANY($1::uuid[])', [list]))).rows;
    let sent = 0;
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(msg), { TTL: 86400, timeout: 5000, urgency: 'high' }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await withSystem(db => db.query('DELETE FROM push_subscriptions WHERE id=$1', [s.id])); else console.error('push failed', code ?? (e as Error).message); }
    }));
    return sent;
  } catch (e) { console.error('push error', (e as Error).message); return 0; }
}

type Job = { id: string; workspace_id: string; title: string; status: string; assignee_id: string | null; created_by: string | null; client_id: string };
async function office(ws: string, client: string, creator: string | null) {
  return (await withSystem(db => db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND (role IN ('admin','staff') OR (role='client' AND client_id=$2 AND user_id=$3))", [ws, client, creator]))).rows.map(r => r.user_id as string);
}
/** After a job is saved: new assignee hears "New job for you"; when it turns done, the office and the client who asked hear "Job done". Not the person who did it. */
export async function pushJobChange(actor: string, before: Partial<Job> | null, after: Job) {
  const url = `/work-orders/${after.id}`;
  if (after.assignee_id && after.assignee_id !== before?.assignee_id && after.assignee_id !== actor)
    await sendPush([after.assignee_id], { title: 'New job for you', body: after.title, url, tag: `assigned-${after.id}` });
  if (after.status === 'done' && before?.status !== 'done')
    await sendPush((await office(after.workspace_id, after.client_id, after.created_by)).filter(u => u !== actor), { title: 'Job done', body: `${after.title} is done.`, url, tag: `done-${after.id}` });
}
/** Daily: jobs that became late today (due yesterday, still not done). Tells the assignee and the office, once. */
export async function pushLateJobs() {
  const late = (await withSystem(db => db.query(`SELECT w.id,w.workspace_id,w.title,w.assignee_id,w.client_id FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id
    WHERE w.status NOT IN ('done','cancelled') AND w.due_on = (CURRENT_TIMESTAMP AT TIME ZONE s.timezone)::date - 1 AND s.demo_expires_at IS NULL`))).rows;
  let sent = 0;
  for (const j of late) sent += await sendPush([j.assignee_id, ...(await office(j.workspace_id, j.client_id, null))], { title: 'Job late', body: `${j.title} was due yesterday.`, url: `/work-orders/${j.id}`, tag: `late-${j.id}` });
  return { late: late.length, sent };
}
