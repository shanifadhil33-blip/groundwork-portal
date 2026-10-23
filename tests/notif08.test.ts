import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
const sent: { endpoint: string; message: { title: string; body: string; tag: string; url: string } }[] = [];
vi.mock('web-push', () => ({ default: { setVapidDetails: vi.fn(), sendNotification: async (s: { endpoint: string }, payload: string) => { sent.push({ endpoint: s.endpoint, message: JSON.parse(payload) }); } } }));
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { getWorkOrder, listWorkOrders, patchWorkOrder, createComment } from '../lib/services/work-orders';
import { pushJobChange, pushOnTheWay, pushClientUpdate, subscribePush } from '../lib/services/push';
import { LANGUAGES } from '../lib/languages';
import { notificationWords } from '../lib/notification-words';
import { formatInLang } from '../lib/date-lang';
import { sendQuote } from '../lib/services/quotes';
import { reportPriceChange } from '../lib/services/price-changes';
import { listNotifications, unreadCount } from '../lib/services/notifications';
import { groupNotifications, notificationMessage, notificationTemplates, renderNotification, openNotificationTarget } from '../lib/ui/notifications';
import { clientStatusLabel, staffStatusLabel } from '../lib/ui/work-orders';
const ws = ids.ridgeline;
const manager = randomUUID(), office = randomUUID(), household = randomUUID(), archived = randomUUID();
let client: string; let priorLang: string | null = null, priorTz = 'Asia/Dubai';
const version = (job: any) => new Date(job.updated_at).toISOString();
beforeAll(async () => {
  process.env.VAPID_PUBLIC_KEY = 'pub'; process.env.VAPID_PRIVATE_KEY = 'priv';
  await withSystem(async db => {
    client = (await db.query('SELECT client_id FROM members WHERE workspace_id=$1 AND user_id=$2', [ws, ids.faisal])).rows[0].client_id;
    for (const [user, kind] of [[manager, 'manager'], [office, 'office'], [household, 'household'], [archived, 'manager']]) {
      await db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)', [user, ({manager:'Hamid',office:'Yusuf',household:'Bilal'} as Record<string,string>)[kind]??'Khalid', `${user}@example.test`]);
      await db.query("INSERT INTO members(workspace_id,user_id,role,client_id,client_kind,archived_at) VALUES($1,$2,'client',$3,$4,$5)", [ws, user, client, kind, user === archived ? new Date() : null]);
    }
    priorLang = (await db.query('SELECT language FROM user_preferences WHERE user_id=$1', [ids.faisal])).rows[0]?.language ?? null;
    priorTz = (await db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0].timezone;
    await db.query("INSERT INTO user_preferences(user_id,language) VALUES($1,'ar') ON CONFLICT(user_id) DO UPDATE SET language='ar'", [ids.faisal]);
  });
  for (const user of [ids.faisal, manager, office, household, ids.imran, ids.sam, ids.ravi])
    await subscribePush(user, { endpoint: `https://push.example/notif08/${user}`, keys: { p256dh: 'B'.repeat(40), auth: 'authauth' } });
});
afterAll(async () => {
  // Leave the shared test workspace as it was: other files read Faisal's language and the workspace time zone.
  await withSystem(async db => { await db.query('UPDATE user_preferences SET language=$2 WHERE user_id=$1', [ids.faisal, priorLang]); await db.query('UPDATE workspaces SET timezone=$2 WHERE id=$1', [ws, priorTz]); });
  await closePools();
});
async function job(status = 'scheduled') {
  return withSystem(async db => (await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,created_by,scheduled_for)
    VALUES($1,$2,$3,'Repair tap',$4,$5,$6,'2032-01-12T07:15:00Z') RETURNING *`, [ws, client, siteId(4), status, ids.ravi, ids.faisal])).rows[0]);
}
it('travel tells exactly the client side followers once, and pushes only the requester in his language', async () => {
  const j = await job(); sent.length = 0;
  const saved = await patchWorkOrder(ids.ravi, ws, j.id, { on_way: true, updated_at: version(j) });
  const notices = () => withSystem(async db => (await db.query("SELECT * FROM notifications WHERE entity_id=$1 AND kind='on_the_way'", [j.id])).rows);
  const rows = await notices();
  expect(rows.map(r => r.user_id).sort()).toEqual([ids.faisal, ids.omar, manager, office].sort());
  for (const row of rows) expect(row).toMatchObject({ workspace_id: ws, entity: 'work_orders', actor_id: ids.ravi, actor_name: 'Ravi', work_order_title: j.title });
  expect(sent).toEqual([{ endpoint: `https://push.example/notif08/${ids.faisal}`, message: { title: 'الإشعارات', body: 'الفني في الدرب عشان Repair tap.', tag: `status-${j.id}`, url: `/work-orders/${j.id}` } }]);
  await expect(patchWorkOrder(ids.ravi, ws, j.id, { on_way: true, updated_at: version(saved) })).rejects.toMatchObject({ status: 422 });
  expect(await notices()).toHaveLength(4); expect(sent).toHaveLength(1);
  const detail = await getWorkOrder(ids.faisal, ws, j.id);
  const list = await listWorkOrders(ids.faisal, ws, new URLSearchParams('pageSize=100'));
  expect(detail.on_way_at).toBeTruthy(); expect(list.data.find(r => r.id === j.id)?.on_way_at).toBeTruthy();
  expect(clientStatusLabel(detail)).toBe('On the way');
  const item = (await listNotifications(ids.faisal, ws, new URLSearchParams('pageSize=100'))).data.find(r => r.kind === 'on_the_way' && r.entity_id === j.id)!;
  expect(item.link_target).toEqual({ entity: 'work_orders', id: j.id });
  expect(item.message).toBe('الفني في الدرب عشان Repair tap.');
  expect(detail.timeline.find((event:any)=>event.kind==='on_the_way')?.message_template.key).toBe(notificationTemplates.client_way);
  const mark = vi.fn(), navigate = vi.fn();
  expect(await openNotificationTarget(item, mark, navigate)).toBe(true); expect(navigate).toHaveBeenCalledWith(j.id);
  const grouped = groupNotifications([item, { ...item, id: randomUUID() }]);
  expect(grouped).toEqual([{ item, rest: [expect.objectContaining({ kind: 'on_the_way' })] }]);
});
it('scheduled requester push includes the visit in workspace time; done includes only after photos', async () => {
  const j = await job('open'); sent.length = 0;
  await withSystem(db => db.query("UPDATE workspaces SET timezone='Asia/Dubai' WHERE id=$1", [ws]));
  await pushJobChange(ids.ravi, { ...j, status: 'open' }, { ...j, status: 'scheduled' });
  expect(sent).toHaveLength(1);
  expect(sent[0].message.body).toBe(`حجزنا زيارتك بخصوص Repair tap في ${formatInLang(j.scheduled_for,{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Dubai'},'ar-AE')}.`);
  await withSystem(async db => {
    for (const kind of ['after', 'after', 'before']) await db.query("INSERT INTO job_photos(workspace_id,client_id,work_order_id,kind,mime,bytes,width,height,taken_by) VALUES($1,$2,$3,$4,'image/jpeg',$5,1,1,$6)", [ws, client, j.id, kind, Buffer.alloc(100, 1), ids.ravi]);
  });
  sent.length = 0;
  await pushJobChange(ids.ravi, j, { ...j, status: 'done' });
  const asker = sent.filter(s => s.endpoint.endsWith(ids.faisal));
  expect(asker).toHaveLength(1);
  expect(asker[0].message.body).toBe('خلصنا Repair tap. فيه 2 صور عقب الشغل. افتح الطلب عشان تشوفها.');
  expect(asker[0].message.url).toBe(`/work-orders/${j.id}#photos`);
  const empty = await job('in_progress'); sent.length = 0;
  await pushJobChange(ids.ravi, empty, { ...empty, status: 'done' });
  expect(sent.find(s => s.endpoint.endsWith(ids.faisal))?.message.body).toBe('خلصنا Repair tap. فيه 0 صور عقب الشغل. افتح الطلب عشان تشوفها.');
});
it('words travel notifications and only changes the scheduled client label', () => {
  expect(notificationMessage({ kind: 'on_the_way', actor_name: 'Ravi', work_order_title: 'Tap' })).toBe('Ravi is on the way for Tap.');
  expect(clientStatusLabel({ status: 'scheduled' })).toBe('Visit Scheduled');
  expect(clientStatusLabel({ status: 'scheduled', on_way_at: '2032-01-12' })).toBe('On the way');
  expect(clientStatusLabel({ status: 'done', on_way_at: '2032-01-12' })).toBe('Completed');
  expect(staffStatusLabel({ status: 'scheduled', on_way_at: '2032-01-12' })).toBe('On the way');
  expect(staffStatusLabel({ status: 'scheduled' })).toBe('Scheduled');
  expect(staffStatusLabel({ status: 'in_progress', on_way_at: '2032-01-12' })).toBe('In Progress');
});

it('rescheduled, cancelled and JOB25 approval messages use the same Arabic sentences in push and bell',async()=>{
 const j=await job();
 // This test changes records directly to isolate message delivery from schedule capacity rules.
 const scheduled_for='2032-01-13T10:30:00Z';
 sent.length=0;
 await pushJobChange(ids.ravi,j,{...j,scheduled_for});
 expect(sent.find(s=>s.endpoint.endsWith(ids.faisal))?.message.body).toBe(`غيّرنا موعد زيارتك بخصوص Repair tap إلى ${formatInLang(scheduled_for,{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Dubai'},'ar-AE')}.`);
 sent.length=0;
 await reportPriceChange(ids.ravi,ws,j.id,{words:'The valve needs replacing'});
 await sendQuote(ids.imran,ws,j.id,{amount:170});
 const approval='سعر Repair tap ينتظر موافقتك. افتح الطلب عشان توافق أو ترفض.';
 expect(sent.find(s=>s.endpoint.endsWith(ids.faisal))?.message.body).toBe(approval);
 const bell=await listNotifications(ids.faisal,ws,new URLSearchParams('pageSize=100'));
 expect(bell.data.find(n=>n.entity_id===j.id&&n.kind==='quote_sent')?.message).toBe(approval);
 const detail=await getWorkOrder(ids.faisal,ws,j.id);
 const pending=detail.timeline.find((e:any)=>e.kind==='price_change'&&e.details.state==='pending');
 expect(renderNotification(pending.message_template,notificationWords('ar'),'ar-AE')).toBe(approval);
 sent.length=0;
 const saved=await patchWorkOrder(ids.imran,ws,j.id,{status:'cancelled',updated_at:version(detail)});
 expect(saved.status).toBe('cancelled');
 expect(sent.find(s=>s.endpoint.endsWith(ids.faisal))?.message.body).toBe('تم إلغاء Repair tap.');
 expect((await listNotifications(ids.faisal,ws,new URLSearchParams('pageSize=100'))).data.find(n=>n.entity_id===j.id&&n.kind==='status_changed')?.message).toBe('تم إلغاء Repair tap.');
});
it('client and household reads discard foreign jobs and internal notes even if old bell rows name them',async()=>{
 const own=await job();
 sent.length=0;
 await createComment(ids.ravi,ws,own.id,{body:'Private technician note',visibility:'internal'});
 expect(sent).toEqual([]);
 const foreign=await withSystem(async db=>(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND client_id<>$2 LIMIT 1',[ws,client])).rows[0]);
 await withSystem(async db=>{
  for(const user of [ids.faisal,manager,office,household]){
   for(const [id,title,kind,to] of [[foreign.id,'Foreign job','on_the_way',null],[own.id,'Private technician note','comment_added','internal']])
    await db.query("INSERT INTO notifications(user_id,workspace_id,entity,entity_id,kind,work_order_title,to_status) VALUES($1,$2,'work_orders',$3,$4,$5,$6)",[user,ws,id,kind,title,to]);
  }
  await db.query("INSERT INTO notifications(user_id,workspace_id,entity,entity_id,kind,work_order_title) VALUES($1,$2,'work_orders',$3,'on_the_way','Another household job')",[household,ws,own.id]);
 });
 for(const user of [ids.faisal,manager,office,household]){
  const listed=await listNotifications(user,ws,new URLSearchParams('pageSize=100'));
  expect(JSON.stringify(listed)).not.toMatch(/Foreign job|Private technician note|Another household job/);
  expect(listed.data.some(n=>n.entity_id===foreign.id)).toBe(false);
  const all=await unreadCount(user);
  expect(all.workspaces.find((w:any)=>w.workspace_id===ws)?.unread_count??0).toBe(listed.unread_count);
  await expect(getWorkOrder(user,ws,foreign.id)).rejects.toMatchObject({status:404});
 }
 await expect(getWorkOrder(household,ws,own.id)).rejects.toMatchObject({status:404});
 const detail=await getWorkOrder(ids.faisal,ws,own.id);
 expect(detail.comments.some((c:any)=>c.body==='Private technician note')).toBe(false);
 expect(JSON.stringify(detail.timeline)).not.toContain('Private technician note');
});

it.each(LANGUAGES)('$code pushes every client step from that language file, including the burst summary',async({code})=>{
 const j=await job();
 await withSystem(async db=>{
  await db.query('UPDATE user_preferences SET language=$2 WHERE user_id=$1',[ids.faisal,code]);
  await db.query('UPDATE push_subscriptions SET burst_count=0,burst_start=NULL WHERE user_id=$1',[ids.faisal]);
 });
 const words=notificationWords(code);
 const expected=(key:string)=>words[key]??key;
 const check=(key:string)=>{
  const body=sent.find(s=>s.endpoint.endsWith(ids.faisal))?.message.body;
  expect(body).toBe(expected(key).replace('{job}','Repair tap').replace('{count}','0').replace('{time}',formatInLang(j.scheduled_for,{dateStyle:'full',timeStyle:'short',timeZone:'Asia/Dubai'},code,code)));
  if(!code.startsWith('en'))expect(body).not.toMatch(/Your visit|The technician|after photos|has been cancelled|waiting for your approval/);
 };
 for(const [status,key] of [['scheduled','client_booked'],['in_progress','client_started'],['done','client_done']] as const){
  sent.length=0;await pushJobChange(ids.ravi,{...j,status:'open'},{...j,status});check(notificationTemplates[key]);
 }
 sent.length=0;await pushOnTheWay(ids.ravi,j);check(notificationTemplates.client_way);
 for(const [kind,key] of [['visit_changed','client_rescheduled'],['job_cancelled','client_cancelled'],['quote_sent','client_price']] as const){
  sent.length=0;await pushClientUpdate(ids.imran,j,kind);check(notificationTemplates[key]);
 }
 expect(sent.find(s=>s.endpoint.endsWith(ids.faisal))?.message.tag).toBe('summary');
});

it('a price without an earlier JOB25 report appears in the timeline and replay sends no second push',async()=>{
 const j=await job();sent.length=0;
 await withSystem(db=>db.query('UPDATE push_subscriptions SET burst_count=0,burst_start=NULL WHERE user_id=$1',[ids.faisal]));
 await withSystem(db=>db.query("UPDATE user_preferences SET language='ar-AE' WHERE user_id=$1",[ids.faisal]));
 const key=randomUUID();
 await sendQuote(ids.imran,ws,j.id,{amount:180},key);
 await sendQuote(ids.imran,ws,j.id,{amount:180},key);
 expect(sent.filter(s=>s.endpoint.endsWith(ids.faisal))).toHaveLength(1);
 const detail=await getWorkOrder(ids.faisal,ws,j.id);
 expect(detail.timeline.filter((e:any)=>e.kind==='quote_sent')).toHaveLength(1);
 expect(detail.timeline.find((e:any)=>e.kind==='quote_sent').message_template.key).toBe(notificationTemplates.client_price);
});
