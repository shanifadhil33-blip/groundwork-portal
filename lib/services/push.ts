import { notificationTemplate, renderNotification } from '../ui/notifications';
import { notificationLanguage, notificationWords } from '../notification-words';
import { isStep, type Message } from '../status-updates';
import webpush from 'web-push';
import { z } from 'zod';
import { withSystem, withUser } from '../db';
import { ApiError } from '../http';

/** Free web push (VAPID). Keys live in Vercel env; without them push is simply off. */
const keys = () => { const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY; return pub && priv ? { pub, priv } : null; };
export function pushPublicKey() { return { key: keys()?.pub ?? null }; }

const sub = z.object({ endpoint: z.url().startsWith('https://').max(1000), keys: z.object({ p256dh: z.string().min(20).max(200), auth: z.string().min(8).max(100) }), device: z.string().max(120).optional() });
export async function isDemoPushUser(user: string) {
  return withUser(user, async db => !!(await db.query('SELECT is_demo FROM users WHERE id=$1', [user])).rows[0]?.is_demo);
}
export async function pushStatus(user: string): Promise<{devices: number; ready: boolean; simulated?: boolean}> {
  if (await isDemoPushUser(user)) return { devices: 0, ready: true, simulated: true };
  return withUser(user, async db => ({ devices: (await db.query('SELECT count(*)::int n FROM push_subscriptions WHERE user_id=$1', [user])).rows[0].n as number, ready: !!keys() })); }
export async function subscribePush(user: string, body: unknown) {
  if (await isDemoPushUser(user)) return { on: true, simulated: true };
  if (!keys()) throw new ApiError(503, 'push_off', 'Notifications are not set up yet. Try again later.');
  const s = sub.parse(body);
  // The same browser may come back under another person: the device now belongs to whoever turned it on last.
  await withSystem(db => db.query('DELETE FROM push_subscriptions WHERE endpoint=$1 AND user_id<>$2', [s.endpoint, user]));
  await withUser(user, db => db.query(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth,device) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT (endpoint) DO UPDATE SET p256dh=EXCLUDED.p256dh, auth=EXCLUDED.auth, device=EXCLUDED.device`, [user, s.endpoint, s.keys.p256dh, s.keys.auth, s.device ?? null]));
  return { on: true };
}
export async function unsubscribePush(user: string, body: unknown) {
  if (await isDemoPushUser(user)) return { on: false, simulated: true };
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
  const list = [...new Set(users)].filter(Boolean); if (!list.length) return 0;
  try {
    // Classify recipients before touching subscriptions, even for urgent messages and old devices.
    const real = await withSystem(async db => {
      const recipients = (await db.query('SELECT id,is_demo,demo_workspace_id FROM users WHERE id=ANY($1::uuid[])', [list])).rows;
      const job = msg.url.match(/^\/work-orders\/([0-9a-f-]{36})(?:#photos)?$/i)?.[1];
      if (job) for (const u of recipients.filter(u => u.is_demo)) {
        // Owner writes are limited to active sandbox members who can see this job.
        // Do not impersonate another member to get around RLS.
        await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify(['demo_push',u.id,job,msg.tag])]);
        await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,work_order_title,job_step_body,to_status)
          SELECT m.user_id,w.workspace_id,'demo_push','work_orders',w.id,w.title,$3,$5
          FROM work_orders w JOIN members m ON m.workspace_id=w.workspace_id
          JOIN workspaces s ON s.id=w.workspace_id
          WHERE w.id=$1 AND m.user_id=$2 AND m.archived_at IS NULL
            AND s.id=$4 AND s.is_demo AND s.demo_expires_at>now()
            AND (m.role IN ('admin','staff') OR (m.role='technician' AND w.assignee_id=m.user_id)
              OR (m.role='client' AND m.client_id=w.client_id AND (m.client_kind<>'household' OR w.created_by=m.user_id)))
            AND NOT EXISTS (SELECT 1 FROM notifications n WHERE n.user_id=m.user_id AND n.workspace_id=w.workspace_id
              AND n.entity_id=w.id AND n.kind='demo_push' AND n.to_status=$5)`, [job,u.id,'Demo notification for {job}. Nothing was sent.',u.demo_workspace_id,msg.tag]);
      }
      return recipients.filter(u => !u.is_demo).map(u => u.id as string);
    });
    const k = keys(); if (!k || !real.length) return 0;
    webpush.setVapidDetails('mailto:shanifadhil33@gmail.com', k.pub, k.priv);
    const fresh = "burst_start IS NULL OR burst_start < now() - interval '10 minutes'";
    const subs = (await withSystem(db => db.query(`UPDATE push_subscriptions SET burst_start=CASE WHEN ${fresh} THEN now() ELSE burst_start END, burst_count=CASE WHEN ${fresh} THEN 1 ELSE burst_count+1 END
      WHERE user_id = ANY($1::uuid[]) AND EXISTS (SELECT 1 FROM users u WHERE u.id=user_id AND NOT u.is_demo) RETURNING id,endpoint,p256dh,auth,burst_count`, [real]))).rows
      .filter(s => msg.urgent || s.burst_count <= BURST_LIMIT + 1).map(s => ({ ...s, out: msg.urgent || s.burst_count <= BURST_LIMIT ? msg : msg.tag.startsWith('status-')?{...msg,tag:'summary'}:SUMMARY }));
    let sent = 0;
    await Promise.all(subs.map(async s => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(s.out), { TTL: 86400, timeout: 5000, urgency: 'high' }); sent++; }
      catch (e) { const code = (e as { statusCode?: number }).statusCode; if (code === 404 || code === 410) await withSystem(db => db.query('DELETE FROM push_subscriptions WHERE id=$1', [s.id])); else console.error('push failed', code ?? (e as Error).message); }
    }));
    return sent;
  } catch (e) { console.error('push error', (e as Error).message); return 0; }
}

type Job = { id: string; workspace_id: string; title: string; status: string; assignee_id: string | null; created_by: string | null; client_id: string; order_number?: number; scheduled_for?: string | Date | null };
export async function office(ws: string, client: string, creator: string | null) {
  return (await withSystem(db => db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND (role IN ('admin','staff') OR (role='client' AND client_id=$2 AND user_id=$3))", [ws, client, creator]))).rows.map(r => r.user_id as string);
}
/** After a job is saved: new assignee hears "New job for you"; when it turns done, the office and the client who asked hear "Job done". Not the person who did it. */
export async function pushJobChange(actor: string, before: Partial<Job> | null, after: Job) {
  const url = `/work-orders/${after.id}`;
  if (after.assignee_id && after.assignee_id !== before?.assignee_id && after.assignee_id !== actor)
    await sendPush([after.assignee_id], { title: 'New job for you', body: after.title, url, tag: `assigned-${after.id}`, urgent: (after as { priority?: string }).priority === 'urgent' });
  // CMP05: the requester hears each step in their own language, only if they may see this job (office() checks that).
  const rescheduled=!['done','cancelled'].includes(after.status)&&!!before&&!!before.scheduled_for&&!!after.scheduled_for&&new Date(before.scheduled_for).getTime()!==new Date(after.scheduled_for).getTime();
  const changed = !!before && (after.status !== before.status && (isStep(after.status)||after.status==='cancelled') || rescheduled);
  if (!changed) return;
  const allowed = (await office(after.workspace_id, after.client_id, after.created_by)).filter(u => u !== actor);
  const asker = after.created_by && after.created_by !== actor && allowed.includes(after.created_by) ? after.created_by : null;
  if (asker) await pushRequester(asker, after, rescheduled&&after.status===before?.status?'rescheduled':after.status as Message|'cancelled');
  if (after.status === 'done') await sendPush(allowed.filter(u => u !== asker), { title: 'Job done', body: `${after.title} is done.`, url, tag: `done-${after.id}` });
}
/** NOTIF08: travel uses exactly the existing requester push visibility rule. */
export async function pushOnTheWay(actor: string, job: Job) {
  const allowed = await office(job.workspace_id, job.client_id, job.created_by);
  if (job.created_by && job.created_by !== actor && allowed.includes(job.created_by))
    await pushRequester(job.created_by, job, 'on_way');
}
/** Client pushes use the same static templates as the bell and timeline. */
export async function pushClientUpdate(actor:string,job:Job,kind:'quote_sent'|'visit_changed'|'job_cancelled') {
 const allowed=await office(job.workspace_id,job.client_id,job.created_by);
 if(job.created_by&&job.created_by!==actor&&allowed.includes(job.created_by))
  await pushRequester(job.created_by,job,kind==='quote_sent'?'price':kind==='visit_changed'?'rescheduled':'cancelled');
}
async function pushRequester(asker: string, job: Job, step: Message|'rescheduled'|'cancelled'|'price') {
  const extra = await withSystem(async db => ({
    language:notificationLanguage((await db.query('SELECT language FROM user_preferences WHERE user_id=$1',[asker])).rows[0]?.language),
    timezone:(await db.query('SELECT timezone FROM workspaces WHERE id=$1',[job.workspace_id])).rows[0].timezone,
    after_photos:(await db.query("SELECT count(*)::int n FROM job_photos WHERE workspace_id=$1 AND work_order_id=$2 AND kind='after'",[job.workspace_id,job.id])).rows[0].n,
  }));
  const words=notificationWords(extra.language);
  const kind=step==='on_way'?'on_the_way':step==='rescheduled'?'visit_changed':step==='price'?'quote_sent':'status_changed';
  const message=notificationTemplate({...job,...extra,kind,entity_id:job.id,work_order_title:job.title,to_status:step},true);
  await sendPush([asker],{title:words['Notifications']??'Notifications',body:renderNotification(message,words,extra.language),url:`/work-orders/${job.id}${step==='done'?'#photos':''}`,tag:`status-${job.id}`});
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
  for (const j of stalled) sent += await sendPush(await office(j.workspace_id, j.client_id, null), { title: 'Job not moving', body: `Job #${j.order_number} ${j.title} has had no update for three days. Tap to reassign or check in.`, url: `/work-orders/${j.id}`, tag: `stalled-${j.id}` });
  return { late: late.length, stalled: stalled.length, sent };
}

/** A test receipt is local for demo users, independently of browser support or VAPID. */
export async function testPush(user: string) {
  if (await isDemoPushUser(user)) return { sent: 0, simulated: true };
  return { sent: await sendPush([user], { title: 'Groundwork', body: 'Notifications are on for this device.', url: '/settings', tag: 'test' }) };
}
