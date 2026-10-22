import { afterAll, beforeEach, expect, it, vi } from 'vitest';
const transport = vi.hoisted(() => ({ sendNotification: vi.fn(async (_subscription: unknown, _body: string, _options: unknown) => ({})), setVapidDetails: vi.fn() }));
vi.mock('web-push', () => ({ default: transport }));
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../lib/fixture';
import { startDemo, resetDemo } from '../lib/services/demo';
import { pushJobChange, pushOnTheWay, pushLateJobs, sendPush, subscribePush, unsubscribePush, pushStatus, testPush } from '../lib/services/push';
import { getDocumentFile, pushExpiringDocuments } from '../lib/services/documents';
import { listNotifications } from '../lib/services/notifications';
import { getDayPlan, postDayPlan } from '../lib/services/day-plan';
import { createWorkOrder } from '../lib/services/work-orders';
import { reportEmergency } from '../lib/services/emergencies';
import { renderNotification, openNotificationTarget } from '../lib/ui/notifications';
import { readFileSync, readdirSync } from 'node:fs';
const rows = (sql: string, args: unknown[] = []) => withSystem(async db => (await db.query(sql,args)).rows);
const message = { title: 'New job for you', body: 'test', url: '/today', tag: 'test' };
async function sandbox() {
  const s = await startDemo({persona:'imran'},'local-demo-push');
  const ws=s.body.workspace_id;
  const users=Object.fromEntries((await rows('SELECT id,demo_persona FROM users WHERE demo_workspace_id=$1',[ws])).map(u=>[u.demo_persona,u.id])) as Record<string,string>;
  return {ws,u:users};
}
const notices = (user:string,ws:string) => listNotifications(user,ws,new URLSearchParams({pageSize:'100'}));
beforeEach(async () => { await rows('DELETE FROM push_subscriptions'); vi.clearAllMocks(); process.env.VAPID_PUBLIC_KEY='pub'; process.env.VAPID_PRIVATE_KEY='priv'; });
afterAll(closePools);

it('demo subscribe, unsubscribe and test never touch a real endpoint, even without VAPID', async () => {
  const {ws,u}=await sandbox();
  await subscribePush(ids.ravi,{endpoint:'https://push.example/shared',keys:{p256dh:'b'.repeat(40),auth:'authauth'}});
  process.env.VAPID_PRIVATE_KEY='';
  expect(await subscribePush(u.ravi,{endpoint:'https://push.example/shared'})).toEqual({on:true,simulated:true});
  expect(await unsubscribePush(u.ravi,{})).toEqual({on:false,simulated:true});
  expect(await pushStatus(u.ravi)).toEqual({devices:0,ready:true,simulated:true});
  expect(await testPush(u.ravi)).toEqual({sent:0,simulated:true});
  expect((await rows('SELECT user_id FROM push_subscriptions WHERE endpoint=$1',['https://push.example/shared']))[0].user_id).toBe(ids.ravi);
  expect(transport.sendNotification).not.toHaveBeenCalled();
  expect((await rows('SELECT 1 FROM push_subscriptions WHERE user_id=$1',[u.ravi]))).toEqual([]);
  expect((await notices(u.ravi,ws)).data.every(n=>n.kind!=='demo_stalled')).toBe(true);
});

it('old demo subscriptions and urgent messages are isolated; mixed real recipients still get real delivery', async () => {
  const {ws,u}=await sandbox(), other=await sandbox();
  const job=(await rows('SELECT * FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 LIMIT 1',[ws,u.ravi]))[0];
  for (const user of [u.ravi,ids.sam]) await rows(`INSERT INTO push_subscriptions(user_id,endpoint,p256dh,auth) VALUES($1,$2,$3,'authauth')`,[user,`https://push.example/${user}`,'b'.repeat(40)]);
  const msg={...message,url:`/work-orders/${job.id}`,urgent:true,tag:`urgent-${job.id}`};
  expect(await sendPush([u.ravi,u.ravi,other.u.ravi],msg)).toBe(0);
  expect(transport.sendNotification).not.toHaveBeenCalled();
  expect((await rows('SELECT burst_count FROM push_subscriptions WHERE user_id=$1',[u.ravi]))[0].burst_count).toBe(0);
  await sendPush([u.ravi],msg);
  expect((await notices(u.ravi,ws)).data.filter(n=>n.kind==='demo_push')).toHaveLength(1);
  expect((await notices(other.u.ravi,other.ws)).data.filter(n=>n.kind==='demo_push')).toHaveLength(0);
  expect(await sendPush([u.ravi,ids.sam],msg)).toBe(1);
  expect(transport.sendNotification).toHaveBeenCalledTimes(1);
  expect(transport.sendNotification.mock.calls[0][0]).toMatchObject({endpoint:`https://push.example/${ids.sam}`});
  expect(await testPush(ids.sam)).toEqual({sent:1});
  const before=transport.sendNotification.mock.calls.length;
  await reportEmergency(u.sam,ws,'I smell gas',{work_order_id:job.id});
  expect(transport.sendNotification).toHaveBeenCalledTimes(before);
});

it('seeded reminders target only the intended people, match cron boundaries and reset locally', async () => {
  const {ws,u}=await sandbox();
  for (const who of ['imran','sam','nabil']) {
    const preview=(await notices(u[who],ws)).data.filter(n=>n.kind.startsWith('demo_'));
    expect(preview.map(n=>n.kind).sort()).toEqual(['demo_document','demo_late','demo_stalled']);
    expect(preview.every(n=>n.link_target&&n.message.includes('Nothing was sent.'))).toBe(true);
  }
  const late=(await notices(u.sam,ws)).data.find(n=>n.kind==='demo_late')!;
  expect((await rows(`SELECT due_on=(now() AT TIME ZONE s.timezone)::date-1 AS boundary FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE w.id=$1`,[late.entity_id]))[0].boundary).toBe(true);
  const stalled=(await notices(u.sam,ws)).data.find(n=>n.kind==='demo_stalled')!;
  expect((await rows("SELECT updated_at<now()-interval '3 days' AND updated_at>=now()-interval '4 days' AS boundary FROM work_orders WHERE id=$1",[stalled.entity_id]))[0].boundary).toBe(true);
  const doc=(await notices(u.imran,ws)).data.find(n=>n.kind==='demo_document')!;
  expect(doc.link_target).toEqual({entity:'documents',id:doc.entity_id});
  expect((await getDocumentFile(u.imran,ws,doc.entity_id)).mime).toBe('application/pdf');
  for (const who of ['ravi','pranav','omar','kevin','faisal']) {
    expect((await notices(u[who],ws)).data.filter(n=>['demo_stalled','demo_document'].includes(n.kind))).toEqual([]);
    await expect(getDocumentFile(u[who],ws,doc.entity_id)).rejects.toThrow();
  }
  const navigate=vi.fn(); await openNotificationTarget(doc,async()=>{},navigate); expect(navigate).toHaveBeenCalledWith(doc.entity_id);
  const realJobs=(await pushLateJobs()), realDocs=await pushExpiringDocuments();
  const expected=(await rows(`SELECT count(*)::int n FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id WHERE s.demo_expires_at IS NULL AND w.status NOT IN ('done','cancelled') AND w.due_on=(now() AT TIME ZONE s.timezone)::date-1`))[0].n;
  expect(realJobs.late).toBe(expected);
  expect(realDocs.documents).toBe(0);
  await expect(notices(ids.sam,ws)).rejects.toThrow();
  const reset=await resetDemo(u.imran,{confirm:true});
  const newWs=reset.body.workspace_id;
  const newSam=(await rows("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='sam'",[newWs]))[0].id;
  expect((await notices(newSam,newWs)).data.filter(n=>n.kind.startsWith('demo_'))).toHaveLength(3);
  await expect(notices(u.sam,newWs)).rejects.toThrow();
  expect(transport.sendNotification).not.toHaveBeenCalled();
});

it('client step previews stay with Harbor and real job delivery still uses the requester rule', async () => {
  const {ws,u}=await sandbox();
  const samples=(await notices(u.pranav,ws)).data.filter(n=>['status_changed','on_the_way'].includes(n.kind));
  expect(samples.some(n=>n.kind==='on_the_way')).toBe(true);
  for (const n of samples) expect((await rows('SELECT client_id FROM work_orders WHERE id=$1',[n.entity_id]))[0].client_id).toBe((await rows('SELECT client_id FROM members WHERE user_id=$1 AND workspace_id=$2',[u.pranav,ws]))[0].client_id);
  for (const who of ['omar','faisal','kevin']) expect((await notices(u[who],ws)).data.filter(n=>n.kind==='on_the_way')).toEqual([]);
  const j=(await rows('SELECT * FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 LIMIT 1',[ws,u.ravi]))[0];
  await pushJobChange(u.ravi,{...j,status:'in_progress'},{...j,status:'done',created_by:u.pranav}); // may be another client: never leak
  await pushOnTheWay(u.ravi,{...j,created_by:u.pranav});
  expect(transport.sendNotification).not.toHaveBeenCalled();
});

it('approved demo plans give a simulated summary and each technician gets only his own notices; real plans keep their summary', async () => {
  const {ws,u}=await sandbox();
  await rows("UPDATE members SET off_days='{}' WHERE workspace_id=$1",[ws]);
  await rows('DELETE FROM time_off WHERE workspace_id=$1',[ws]);
  const site=(await rows('SELECT id,client_id FROM sites WHERE workspace_id=$1 ORDER BY id LIMIT 1',[ws]))[0];
  await createWorkOrder(u.sam,ws,{title:'Repair test tap',client_id:site.client_id,site_id:site.id,trade:'plumbing',priority:'normal'});
  const plan=await getDayPlan(u.sam,ws);
  expect(plan.lines.some(l=>l.kind==='place')).toBe(true);
  const r=await postDayPlan(u.sam,ws,{action:'approve',fingerprint:plan.fingerprint});
  expect(r.reply).toContain('Notifications are simulated.');
  const own=(await notices(u.ravi,ws)).data.filter(n=>n.kind==='day_plan');
  expect(own.length).toBeGreaterThan(0);
  for (const n of own) expect((await rows('SELECT assignee_id FROM work_orders WHERE id=$1',[n.entity_id]))[0].assignee_id).toBe(u.ravi);
  expect(transport.sendNotification).not.toHaveBeenCalled();
  await rows("UPDATE members SET off_days='{}' WHERE workspace_id=$1",[ids.ridgeline]);
  await rows('DELETE FROM time_off WHERE workspace_id=$1',[ids.ridgeline]);
  await createWorkOrder(ids.sam,ids.ridgeline,{title:'Repair test tap',client_id:ids.harbor,site_id:siteId(1),trade:'plumbing'});
  const real=await getDayPlan(ids.sam,ids.ridgeline);
  const saved=await postDayPlan(ids.sam,ids.ridgeline,{action:'approve',fingerprint:real.fingerprint});
  expect(saved.reply).toContain('No phone notification went out.');
  expect(saved.reply).not.toContain('simulated');
});

it('every preview template ships in all language files without runtime translation', async () => {
  const {ws,u}=await sandbox();
  const previews=(await notices(u.sam,ws)).data.filter(n=>n.kind.startsWith('demo_'));
  for(const file of readdirSync('public/i18n')) {
    const words=JSON.parse(readFileSync(`public/i18n/${file}`,'utf8'));
    for(const n of previews){expect(n.message_template.runtime).not.toBe(true);expect(words[n.message_template.key]).toBeTruthy();expect(renderNotification(n.message_template,words)).not.toBe(n.message);}
  }
});
