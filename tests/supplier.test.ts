import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools, ownerPool, withSystem, withUser } from '../lib/db';
import { ids, orderId, seed } from '../scripts/seed';
import { setAuthResolverForTests } from '../lib/auth';
import { signedRequest, signature } from '../lib/cobalt/signature';
import * as supplier from '../lib/services/supplier';
import { dashboard } from '../lib/services/workspaces';
import * as webhook from '../app/api/webhooks/cobalt/route';
import * as orders from '../app/api/workspaces/[ws]/supplier/orders/route';
import * as check from '../app/api/workspaces/[ws]/supplier/check/route';
import * as repair from '../app/api/workspaces/[ws]/supplier/repair/route';
import * as runs from '../app/api/workspaces/[ws]/supplier/sync-runs/route';
import * as advance from '../app/api/workspaces/[ws]/supplier/simulator/advance/route';
import * as outage from '../app/api/workspaces/[ws]/supplier/simulator/outage/route';
import * as events from '../app/api/workspaces/[ws]/supplier/simulator/events/route';
import * as cron from '../app/api/cron/supplier-sync/route';
import type { RouteContext } from '../lib/api';
const ws=ids.ridgeline;
let user:string|null=ids.imran;
const priorWebhook=process.env.COBALT_WEBHOOK_SECRET,priorCron=process.env.CRON_SECRET;
beforeEach(async()=>{
 process.env.COBALT_WEBHOOK_SECRET='supplier-test-signing-key';process.env.CRON_SECRET='supplier-test-cron-key';
 user=ids.imran;setAuthResolverForTests(async()=>user);
 const db=await ownerPool.connect();try{await seed(db,true);}finally{db.release();}
});
afterAll(async()=>{setAuthResolverForTests();if(priorWebhook===undefined)delete process.env.COBALT_WEBHOOK_SECRET;else process.env.COBALT_WEBHOOK_SECRET=priorWebhook;if(priorCron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=priorCron;await closePools();});
type Handler=(req:Request,c?:RouteContext)=>Promise<Response>;
async function call(handler:Handler,method='GET',body?:unknown,workspace=ws,query='') {
 const response=await handler(new Request('http://localhost/api'+query,{method,...(body===undefined?{}:{body:JSON.stringify(body)})}),{params:Promise.resolve({ws:workspace})});return {status:response.status,body:await response.json()};
}
function event(overrides:Record<string,unknown>={}){return {workspace_id:ws,cobalt_ref:'COBALT-DEMO-4',event_id:randomUUID(),sequence:7,status:'delivered',occurred_at:new Date().toISOString(),...overrides};}
async function snapshot(){return withSystem(async db=>{
 const result:Record<string,unknown>={};for(const table of ['supplier_orders','supplier_events','work_orders','audit_log','work_order_events','notifications'])result[table]=(await db.query(`SELECT * FROM ${table}${table==='audit_log'?" WHERE entity<>'supplier_sync_runs'":''} ORDER BY id`)).rows;
 return JSON.parse(JSON.stringify(result));
});}
async function dropped(){const ref='COBALT-DEMO-3';await supplier.advance(ids.imran,ws,{cobalt_ref:ref,status:'shipped'});const result=await supplier.advance(ids.imran,ws,{cobalt_ref:ref,status:'delivered',drop:true});return {ref,result};}
describe('signed Cobalt webhook ingest',()=>{
 it('accepts a valid signed raw body and resumes waiting work with timeline, audit and notifications',async()=>{
  const response=await webhook.POST(signedRequest(event()));expect(response.status).toBe(200);expect(await response.json()).toEqual({duplicate:false});
  const state=await withUser(ids.imran,async db=>({work:(await db.query('SELECT status FROM work_orders WHERE id=$1',[orderId(4)])).rows[0],events:(await db.query('SELECT kind FROM work_order_events WHERE work_order_id=$1',[orderId(4)])).rows,audit:(await db.query("SELECT * FROM audit_log WHERE entity_id=$1 AND action='update'",[orderId(4)])).rows}));
  expect(state.work.status).toBe('in_progress');expect(state.events).toContainEqual({kind:'status_changed'});expect(state.audit.length).toBeGreaterThan(0);
  expect(await withUser(ids.sam,async db=>(await db.query('SELECT kind FROM notifications WHERE entity_id=$1',[orderId(4)])).rows)).toContainEqual({kind:'status_changed'});
 });
 it.each(['bad','missing','stale','future'])('rejects %s signature without writing',async kind=>{
  const before=await snapshot(),body=JSON.stringify(event());
  const timestamp=String(Math.floor(Date.now()/1000)+(kind==='stale'?-301:kind==='future'?301:0));
  const headers:Record<string,string>=kind==='missing'?{}:{'x-cobalt-timestamp':timestamp,'x-cobalt-signature':kind==='bad'?'0'.repeat(64):signature(timestamp,body)};
  const response=await webhook.POST(new Request('http://localhost',{method:'POST',body,headers}));expect(response.status).toBe(401);expect(await snapshot()).toEqual(before);
 });
 it('rejects signed malformed JSON with 400 and invalid payload with 422',async()=>{
  const timestamp=String(Math.floor(Date.now()/1000)),body='{';
  expect((await webhook.POST(new Request('http://localhost',{method:'POST',body,headers:{'x-cobalt-timestamp':timestamp,'x-cobalt-signature':signature(timestamp,body)}}))).status).toBe(400);
  expect((await webhook.POST(signedRequest({status:'nonsense'}))).status).toBe(422);
 });
 it('duplicate delivery returns 200 and changes no rows',async()=>{
  const payload=event();await webhook.POST(signedRequest(payload));const before=await snapshot();
  const response=await webhook.POST(signedRequest(payload));expect(response.status).toBe(200);expect(await response.json()).toEqual({duplicate:true});expect(await snapshot()).toEqual(before);
 });
 it('stores older receipts without regressing delivered to shipped',async()=>{
  await webhook.POST(signedRequest(event({sequence:20})));
  await webhook.POST(signedRequest(event({status:'shipped',sequence:10})));
  expect((await supplier.listOrders(ids.imran,ws)).data.find(o=>o.cobalt_ref==='COBALT-DEMO-4').local_status).toBe('delivered');
  await webhook.POST(signedRequest(event({status:'shipped',sequence:21})));
  expect((await supplier.listOrders(ids.imran,ws)).data.find(o=>o.cobalt_ref==='COBALT-DEMO-4').local_status).toBe('delivered');
 });
});
describe('Cobalt source, check and idempotent repair',()=>{
 it('fresh fixture has exactly one dropped delivered event; check leaves business data unchanged',async()=>{
  const before=await snapshot(),result=await supplier.check(ids.imran,ws);
  expect(result.mismatches).toEqual([expect.objectContaining({cobalt_ref:'COBALT-DEMO-4',local_status:'shipped',cobalt_status:'delivered',missing_event_ids:['demo-delivered-4'],message:'Cobalt says delivered, we still show waiting on parts'})]);
  expect(await snapshot()).toEqual(before);expect((await dashboard(ids.imran,ws)).last_supplier_sync_at).toBeTruthy();
 });
 it('detects a newly dropped webhook from the sequenced events API',async()=>{
  const {ref,result}=await dropped();expect(result.delivered).toBe(false);
  const source=await supplier.events(ids.sam,ws,new URLSearchParams('since=6'));expect(source.events.map(e=>e.sequence)).toEqual([7,8]);
  const before=await snapshot(),checked=await supplier.check(ids.imran,ws);
  expect(checked.mismatches).toContainEqual(expect.objectContaining({cobalt_ref:ref,missing_event_ids:[result.event.event_id],cobalt_status:'delivered',local_status:'shipped'}));expect(await snapshot()).toEqual(before);
 });
 it('repairs once with timeline/audit; repeat preserves all audit/events/notifications; late webhook is duplicate',async()=>{
  const payload=await supplier.events(ids.imran,ws,new URLSearchParams('since=5'));
  expect((await supplier.repair(ids.imran,ws,{cobalt_ref:'COBALT-DEMO-4'})).repaired).toBe(1);
  const details=await withUser(ids.imran,async db=>({timeline:(await db.query("SELECT body FROM work_order_events WHERE work_order_id=$1 AND kind='supplier_repaired'",[orderId(4)])).rows,audit:(await db.query("SELECT * FROM audit_log WHERE entity='supplier_events' AND \"after\"->>'event_id'='demo-delivered-4'")).rows,receipt:(await db.query("SELECT received_via FROM supplier_events WHERE event_id='demo-delivered-4'")).rows[0]}));
  expect(details.timeline).toEqual([{body:'Repaired by sync'}]);expect(details.audit).toHaveLength(1);expect(details.receipt.received_via).toBe('reconcile');
  const before=await snapshot();expect((await supplier.repair(ids.imran,ws,{})).repaired).toBe(0);expect(await snapshot()).toEqual(before);
  const response=await webhook.POST(signedRequest(payload.events[0]));expect(await response.json()).toEqual({duplicate:true});expect(await snapshot()).toEqual(before);
 });
 it('concurrent repairs and concurrent webhook/repair apply an event exactly once',async()=>{
  const results=await Promise.all([supplier.repair(ids.imran,ws,{}),supplier.repair(ids.imran,ws,{})]);expect(results.map(r=>r.repaired).sort()).toEqual([0,1]);
  const {result}=await dropped();await Promise.all([supplier.repair(ids.imran,ws,{}),supplier.ingestWebhook(signedRequest(result.event))]);
  const count=await withUser(ids.imran,async db=>(await db.query('SELECT count(*)::int AS n FROM supplier_events WHERE event_id=$1',[result.event.event_id])).rows[0].n);expect(count).toBe(1);
 });
 it('outage is a plain retryable 503 and persists an error run without business writes',async()=>{
  await supplier.setOutage(ids.imran,ws,{outage:true});const before=await snapshot();
  const response=await call(check.POST,'POST');expect(response.status).toBe(503);expect(response.body.error).toEqual({code:'cobalt_unavailable',message:'Cobalt is unavailable right now. Try again.'});
  expect(await snapshot()).toEqual(before);expect((await supplier.syncRuns(ids.imran,ws))[0]).toMatchObject({status:'error',error_message:'Cobalt is unavailable right now. Try again.'});
  await supplier.setOutage(ids.imran,ws,{outage:false});expect((await call(check.POST,'POST')).status).toBe(200);
 });
 it('repairs projection drift even when all receipts are present',async()=>{
  await supplier.repair(ids.imran,ws,{});
  await withSystem(db=>db.query("UPDATE supplier_orders SET local_status='shipped' WHERE workspace_id=$1 AND cobalt_ref='COBALT-DEMO-4'",[ws]));
  const checked=await supplier.check(ids.imran,ws);expect(checked.mismatches[0].missing_event_ids).toEqual([]);
  expect((await supplier.repair(ids.imran,ws,{})).repaired).toBe(1);
  const before=await snapshot();expect((await supplier.repair(ids.imran,ws,{})).repaired).toBe(0);expect(await snapshot()).toEqual(before);
 });
 it('places orders separately and changes only an eligible work-order status',async()=>{
  user=ids.sam;const placed=await call(orders.POST,'POST',{work_order_id:orderId(3)});expect(placed.status).toBe(201);expect(placed.body.cobalt_ref).toMatch(/^CB-/);expect(placed.body.supplier).toBe('simulated supplier, part of this repo');
  expect(await withUser(ids.sam,async db=>(await db.query('SELECT status FROM work_orders WHERE id=$1',[orderId(3)])).rows[0].status)).toBe('waiting_on_parts');
  expect((await call(orders.POST,'POST',{work_order_id:orderId(5)})).status).toBe(422);
  expect((await call(orders.POST,'POST',{work_order_id:orderId(61)})).status).toBe(404);
 });
 it('advances through signed ingest; cancellation and invalid transitions are handled',async()=>{
  const changed=await call(advance.POST,'POST',{cobalt_ref:'COBALT-DEMO-1',status:'shipped'});expect(changed.body.delivered).toBe(true);
  expect((await supplier.listOrders(ids.imran,ws)).data.find(o=>o.cobalt_ref==='COBALT-DEMO-1').local_status).toBe('shipped');
  expect((await call(advance.POST,'POST',{cobalt_ref:'COBALT-DEMO-1',status:'ordered'})).status).toBe(422);
  expect((await call(advance.POST,'POST',{cobalt_ref:'COBALT-DEMO-1',status:'cancelled'})).body.delivered).toBe(true);
 });
});
describe('supplier route roles, RLS and cron',()=>{
 const routeCases:[Handler,string,unknown?][]=[[orders.GET,'GET'],[orders.POST,'POST',{work_order_id:orderId(3)}],[check.POST,'POST'],[repair.POST,'POST',{}],[runs.GET,'GET'],[advance.POST,'POST',{cobalt_ref:'COBALT-DEMO-1',status:'shipped'}],[outage.POST,'POST',{outage:true}],[events.GET,'GET']];
 it('admin can check/repair; staff can GET but cannot check/repair/simulate',async()=>{
  expect((await call(check.POST,'POST')).status).toBe(200);expect((await call(repair.POST,'POST',{})).status).toBe(200);
  user=ids.sam;for(const [handler,method,body] of routeCases.filter(([h])=>h!==orders.POST))expect((await call(handler,method,body)).status).toBe(method==='GET'?200:403);
 });
 it.each([ids.pranav,ids.summitAdmin])('all supplier routes are neutral 404 for hidden role/workspace %s',async identity=>{
  user=identity;for(const [handler,method,body] of routeCases){const response=await call(handler,method,body);expect(response.status).toBe(404);expect(response.body.error.code).toBe('not_found');}
 });
 it('never includes either secret in supplier route or webhook responses',async()=>{
  for(const [handler,method,body] of routeCases){
   const response=await call(handler,method,body),text=JSON.stringify(response.body);
   expect(text).not.toContain(process.env.COBALT_WEBHOOK_SECRET);expect(text).not.toContain(process.env.CRON_SECRET);
  }
  const response=await webhook.POST(signedRequest(event()));const text=await response.text();
  expect(text).not.toContain(process.env.COBALT_WEBHOOK_SECRET);expect(text).not.toContain(process.env.CRON_SECRET);
 });
 it('new tables enforce RLS and do not grant source mutation to the app',async()=>{
  for(const table of ['cobalt_state','cobalt_orders','cobalt_events','supplier_sync_runs']){
   expect(await withUser(ids.pranav,async db=>(await db.query(`SELECT * FROM ${table}`)).rows)).toHaveLength(0);
   expect(await withUser(ids.summitAdmin,async db=>(await db.query(`SELECT * FROM ${table} WHERE workspace_id=$1`,[ws])).rows)).toHaveLength(0);
   await expect(withUser(ids.imran,db=>db.query(`DELETE FROM ${table}`))).rejects.toMatchObject({code:'42501'});
  }
 });
 it('requires cron bearer authorization on GET and POST',async()=>{
  for(const handler of [cron.GET,cron.POST])for(const token of [undefined,'Bearer invalid']){
   const response=await handler(new Request('http://localhost',{headers:token?{Authorization:token}:{}}));expect(response.status).toBe(401);
  }
 });
 it('cron preserves demo scenarios and returns no secrets',async()=>{
  await supplier.placeOrder(ids.summitAdmin,ids.summit,{work_order_id:orderId(63)});
  for(const handler of [cron.GET,cron.POST]){
   const response=await handler(new Request('http://localhost',{headers:{Authorization:'Bearer '+process.env.CRON_SECRET}}));expect(response.status).toBe(200);
   const body=await response.json();expect(body.workspaces).toBe(0);expect(body.checked).toBe(0);expect(body.errors).toBe(0);expect(JSON.stringify(body)).not.toContain(process.env.CRON_SECRET);expect(JSON.stringify(body)).not.toContain(process.env.COBALT_WEBHOOK_SECRET);
  }
  expect(await supplier.syncRuns(ids.imran,ws)).toEqual([]);
 });
});

it('audits each completed manual check/repair once, including no-op repairs and failures',async()=>{
 await supplier.check(ids.imran,ws);await supplier.repair(ids.imran,ws,{});await supplier.repair(ids.imran,ws,{});await supplier.setOutage(ids.imran,ws,{outage:true});await expect(supplier.check(ids.imran,ws)).rejects.toMatchObject({status:503});
 const entries=await withUser(ids.imran,async db=>(await db.query("SELECT * FROM audit_log WHERE entity='supplier_sync_runs' ORDER BY at")).rows);
 expect(entries).toHaveLength(4);expect(entries.every(e=>e.actor_id===ids.imran&&e.action==='update')).toBe(true);expect(entries.at(-1).after.status).toBe('error');expect(entries[2].after.repaired_count).toBe(0);
});
