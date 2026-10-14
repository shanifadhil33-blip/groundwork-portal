import { isStep, statusLine, type Step } from '../status-updates';
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

type Msg = { title: string; body: string; url: string; tag: string; urgent?: boolean };
/** CMP08: at most this many pushes per device in 10 minutes. The next one becomes a single summary; the rest wait in the bell. Urgent ones always go. */
export const BURST_LIMIT = 6;
const SUMMARY: Msg = { title: 'More job updates', body: 'You have more updates. Open Groundwork to see them all.', url: '/home', tag: 'summary' };
/** Send to every device of these people. Dead devices (404/410) are removed. Never throws. */
export async function sendPush(users: string[], msg: Msg) {
  const k = keys(); const list = [...new Set(users)].filter(Boolean); if (!k || !list.length) return 0;
  try {
    webpush.setVapidDetails('mailto:shanifadhil33@gmail.com', k.pub, k.priv);
    const fresh = "burst_start IS NULL OR burst_start < now() - interval '10 minutes'";
    const subs = (await withSystem(db => db.query(`UPDATE push_subscriptions SET burst_start=CASE WHEN ${fresh} THEN now() ELSE burst_start END, burst_count=CASE WHEN ${fresh} THEN 1 ELSE burst_count+1 END
      WHERE user_id = ANY($1::uuid[]) RETURNING id,endpoint,p256dh,auth,burst_count`, [list]))).rows
      .filter(s => msg.urgent || s.burst_count <= BURST_LIMIT + 1).map(s => ({ ...s, out: msg.urgent || s.burst_count <= BURST_LIMIT ? msg : SUMMARY }));
    let sent = 0;
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(s.out), { TTL: 86400, timeout: 5000, urgency: 'high' }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await withSystem(db => db.query('DELETE FROM push_subscriptions WHERE id=$1', [s.id])); else console.error('push failed', code ?? (e as Error).message); }
    }));
    return sent;
  } catch (e) { console.error('push error', (e as Error).message); return 0; }
}

type Job = { id: string; workspace_id: string; title: string; status: string; assignee_id: string | null; created_by: string | null; client_id: string };
export async function office(ws: string, client: string, creator: string | null) {
  return (await withSystem(db => db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND (role IN ('admin','staff') OR (role='client' AND client_id=$2 AND user_id=$3))", [ws, client, creator]))).rows.map(r => r.user_id as string);
}
/** After a job is saved: new assignee hears "New job for you"; when it turns done, the office and the client who asked hear "Job done". Not the person who did it. */
export async function pushJobChange(actor: string, before: Partial<Job> | null, after: Job) {
  const url = `/work-orders/${after.id}`;
  if (after.assignee_id && after.assignee_id !== before?.assignee_id && after.assignee_id !== actor)
    await sendPush([after.assignee_id], { title: 'New job for you', body: after.title, url, tag: `assigned-${after.id}`, urgent: (after as { priority?: string }).priority === 'urgent' });
  // CMP05: the requester hears each step in their own language, only if they may see this job (office() checks that).
  const changed = !!before && after.status !== before.status && isStep(after.status);
  if (!changed) return;
  const allowed = (await office(after.workspace_id, after.client_id, after.created_by)).filter(u => u !== actor);
  const asker = after.created_by && after.created_by !== actor && allowed.includes(after.created_by) ? after.created_by : null;
  if (asker) {
    const lang = (await withSystem(db => db.query('SELECT language FROM user_preferences WHERE user_id=$1', [asker]))).rows[0]?.language ?? null;
    const m = statusLine(lang, after.status as Step, (after as { order_number?: number }).order_number ?? '', after.title);
    await sendPush([asker], { title: m.title, body: m.body, url, tag: `status-${after.id}` });
  }
  if (after.status === 'done') await sendPush(allowed.filter(u => u !== asker), { title: 'Job done', body: `${after.title} is done.`, url, tag: `done-${after.id}` });
}
/** Daily: jobs that became late today (due yesterday, still not done). Tells the assignee and the office, once. */
export async function pushLateJobs() {
  const late = (await withSystem(db => db.query(`SELECT w.id,w.workspace_id,w.title,w.assignee_id,w.client_id FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id
    WHERE w.status NOT IN ('done','cancelled') AND w.due_on = (CURRENT_TIMESTAMP AT TIME ZONE s.timezone)::date - 1 AND s.demo_expires_at IS NULL`))).rows;
  let sent = 0;
  for (const j of late) sent += await sendPush([j.assignee_id, ...(await office(j.workspace_id, j.client_id, null))], { title: 'Job late', body: `${j.title} was due yesterday.`, url: `/work-orders/${j.id}`, tag: `late-${j.id}` });
  // Stalled: an active job nobody touched for three days goes to the office once (same tag, no repeats).
  const stalled = (await withSystem(db => db.query(`SELECT w.id,w.workspace_id,w.title,w.order_number,w.client_id FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id
    WHERE w.status IN ('scheduled','in_progress') AND w.archived_at IS NULL AND w.updated_at < now() - interval '3 days' AND w.updated_at >= now() - interval '4 days' AND s.demo_expires_at IS NULL`))).rows;
  for (const j of stalled) sent += await sendPush(await office(j.workspace_id, j.client_id, null), { title: 'Job not moving', body: `WO ${j.order_number} ${j.title} has had no update for three days. Tap to reassign or check in.`, url: `/work-orders/${j.id}`, tag: `stalled-${j.id}` });
  return { late: late.length, stalled: stalled.length, sent };
}
