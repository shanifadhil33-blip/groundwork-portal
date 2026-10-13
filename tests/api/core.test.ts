import { decideSuggestion } from '../../lib/services/suggestions';
import { getWorkOrder } from '../../lib/services/work-orders';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setAuthResolverForTests } from '../../lib/auth';
import { closePools, withSystem, withUser } from '../../lib/db';
import { ids, orderId, siteId } from '../../scripts/seed';
import * as meRoute from '../../app/api/me/route';
import * as wsRoute from '../../app/api/workspaces/route';
import * as workspaceRoute from '../../app/api/workspaces/[ws]/route';
import * as dashboardRoute from '../../app/api/workspaces/[ws]/dashboard/route';
import * as clientsRoute from '../../app/api/workspaces/[ws]/clients/route';
import * as clientRoute from '../../app/api/workspaces/[ws]/clients/[id]/route';
import * as sitesRoute from '../../app/api/workspaces/[ws]/clients/[id]/sites/route';
import * as siteRoute from '../../app/api/workspaces/[ws]/sites/[id]/route';
import * as membersRoute from '../../app/api/workspaces/[ws]/members/route';
import * as memberRoute from '../../app/api/workspaces/[ws]/members/[userId]/route';
import * as invitesRoute from '../../app/api/workspaces/[ws]/invites/route';
import * as revokeRoute from '../../app/api/workspaces/[ws]/invites/[id]/revoke/route';
import * as acceptRoute from '../../app/api/invites/accept/route';
import * as ordersRoute from '../../app/api/workspaces/[ws]/work-orders/route';
import * as orderRoute from '../../app/api/workspaces/[ws]/work-orders/[id]/route';
import * as commentsRoute from '../../app/api/workspaces/[ws]/work-orders/[id]/comments/route';
import type { RouteContext } from '../../lib/api';
import { hash } from '../../lib/services/shared';
import { archiveMember } from '../../lib/services/members';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
let user:string|null=ids.imran;
beforeEach(()=>{user=ids.imran;setAuthResolverForTests(async()=>user);});
afterAll(async()=>{setAuthResolverForTests();await closePools();});
async function call(handler:Handler,method='GET',body?:unknown,params:Record<string,string>={},query='',headers:Record<string,string>={}) {
 const req=new Request('http://localhost/api'+query,{method,headers:{'Content-Type':'application/json',...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await handler(req,{params:Promise.resolve({ws:ids.ridgeline,...params})});
 return {status:response.status,body:await response.json(),headers:response.headers};
}
async function newOrder(title='API test request') {
 const r=await call(ordersRoute.POST,'POST',{title,site_id:siteId(1)});
 expect(r.status).toBe(201);return r.body;
}
async function invite(email:string,key?:string) {
 const r=await call(invitesRoute.POST,'POST',{email,role:'client',client_id:ids.harbor},{},'',key?{'Idempotency-Key':key}:{});
 expect(r.status).toBe(201);return r.body;
}
async function newUser(email:string) {
 const id=randomUUID();await withSystem(db=>db.query('INSERT INTO users(id,name,email) VALUES($1,$2,$3)',[id,'Invitee',email]));return id;
}
describe('core API tenancy and auth',()=>{
 it('returns 401 without a session',async()=>{
  user=null;
  const r=await call(meRoute.GET);expect(r.status).toBe(401);expect(r.body.error.code).toBe('unauthenticated');
 });
 it('me includes own membership, workspace and client names',async()=>{
  user=ids.pranav;const r=await call(meRoute.GET);
  expect(r.status).toBe(200);expect(r.body.user.id).toBe(ids.pranav);
  expect(r.body.memberships).toEqual([expect.objectContaining({role:'client',workspace_name:'Ridgeline Facility Services',client_name:'Harbor & Pine Coworking'})]);
 });
 it('Pranav gets neutral 404 for a Northgate work order',async()=>{
  user=ids.pranav;const r=await call(orderRoute.GET,'GET',undefined,{id:orderId(4)});
  expect(r.status).toBe(404);expect(r.body.error.message).toBe("We couldn't find that, or you don't have access.");
 });
 it('Pranav lists only Harbor & Pine and cannot see internal detail comments',async()=>{
  user=ids.pranav;
  const list=await call(ordersRoute.GET,'GET',undefined,{},'?pageSize=100');
  expect(list.status).toBe(200);expect(list.body.total).toBe(36);
  expect(list.body.data.every((o:{client_id:string})=>o.client_id===ids.harbor)).toBe(true);
  const detail=await call(orderRoute.GET,'GET',undefined,{id:orderId(1)});
  expect(detail.status).toBe(200);expect(detail.body.comments.length).toBeGreaterThan(0);
  expect(detail.body.comments.every((c:{visibility:string})=>c.visibility==='client')).toBe(true);
  expect(detail.body.site.name).toBe('Marina Exchange');expect(detail.body.timeline.length).toBeGreaterThan(0);
 });
 it('Pranav gets 403 patching his own work order, 404 for hidden orders',async()=>{
  user=ids.pranav;
  expect((await call(orderRoute.PATCH,'PATCH',{status:'done'},{id:orderId(1)})).status).toBe(403);
  expect((await call(orderRoute.PATCH,'PATCH',{status:'done'},{id:orderId(4)})).status).toBe(404);
 });
 it('Sam cannot create clients or access Summit',async()=>{
  user=ids.sam;expect((await call(clientsRoute.POST,'POST',{name:'Forbidden'})).status).toBe(403);
  expect((await call(workspaceRoute.GET,'GET',undefined,{ws:ids.summit})).status).toBe(404);
  expect((await call(clientsRoute.GET)).status).toBe(200);
 });
 it('client creation forces own company and source and rejects controlled fields',async()=>{
  user=ids.pranav;
  const r=await call(ordersRoute.POST,'POST',{title:'Client request',site_id:siteId(1)});
  expect(r.status).toBe(201);expect(r.body).toMatchObject({client_id:ids.harbor,source:'client',status:'pending',work_order_id:null});
  for(const field of [{status:'done'},{assignee_id:ids.sam},{scheduled_for:new Date().toISOString()}])expect((await call(ordersRoute.POST,'POST',{title:'Denied',site_id:siteId(1),...field})).status).toBe(422);
  expect((await call(ordersRoute.POST,'POST',{title:'Other company',site_id:siteId(4)})).status).toBe(404);
  expect((await call(ordersRoute.POST,'POST',{title:'Other company',site_id:siteId(1),client_id:ids.northgate})).status).toBe(422);
 });
 it('clients can post only client-visible comments',async()=>{
  user=ids.pranav;
  expect((await call(commentsRoute.POST,'POST',{body:'New client comment',visibility:'client'},{id:orderId(1)})).status).toBe(201);
  expect((await call(commentsRoute.POST,'POST',{body:'Secret',visibility:'internal'},{id:orderId(1)})).status).toBe(422);
  expect((await call(commentsRoute.POST,'POST',{body:'Wrong client',visibility:'client'},{id:orderId(4)})).status).toBe(404);
 });
 it('dashboard aggregates only visible orders and hides internal queue/supplier data',async()=>{
  user=ids.pranav;
  const r=await call(dashboardRoute.GET);expect(r.status).toBe(200);
  const own=await withUser(ids.pranav,async db=>(await db.query('SELECT status,count(*)::int AS n FROM work_orders WHERE workspace_id=$1 GROUP BY status',[ids.ridgeline])).rows);
  for(const group of own)expect(r.body.by_status[group.status]).toBe(group.n);
  expect(r.body.pending_queue_rows).toBe(0);expect(r.body.last_supplier_sync_at).toBeNull();
  const overdue=await withUser(ids.pranav,async db=>(await db.query("SELECT count(*)::int AS n FROM work_orders WHERE workspace_id=$1 AND due_on<(now() AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=work_orders.workspace_id))::date AND status NOT IN ('done','cancelled')",[ids.ridgeline])).rows[0].n);
  expect(r.body.overdue).toBe(overdue);
 });
});
describe('management API',()=>{
 it('Imran creates, reads, patches and deletes clients/sites',async()=>{
  const created=await call(clientsRoute.POST,'POST',{name:'API CRUD company'});expect(created.status).toBe(201);
  const id=created.body.id;
  expect((await call(clientRoute.GET,'GET',undefined,{id})).body.name).toBe('API CRUD company');
  expect((await call(clientRoute.PATCH,'PATCH',{name:'Renamed company'},{id})).body.name).toBe('Renamed company');
  const site=await call(sitesRoute.POST,'POST',{name:'Warehouse',address:'12 Test Road'},{id});expect(site.status).toBe(201);
  expect((await call(sitesRoute.GET,'GET',undefined,{id})).body).toHaveLength(1);
  expect((await call(siteRoute.PATCH,'PATCH',{address:'14 Test Road'},{id:site.body.id})).body.address).toBe('14 Test Road');
  expect((await call(siteRoute.DELETE,'DELETE',undefined,{id:site.body.id})).status).toBe(200);
  expect((await call(clientRoute.DELETE,'DELETE',undefined,{id})).status).toBe(200);
  expect((await call(clientRoute.GET,'GET',undefined,{id})).status).toBe(404);
 });
 it('onboarding makes creator admin; settings and name-confirmed deletion work',async()=>{
  const created=await call(wsRoute.POST,'POST',{name:'Disposable workspace',timezone:'Europe/London'});expect(created.status).toBe(201);
  const ws=created.body.id;
  const me=await call(meRoute.GET);expect(me.body.memberships).toContainEqual(expect.objectContaining({workspace_id:ws,role:'admin'}));
  expect((await call(workspaceRoute.PATCH,'PATCH',{name:'Updated workspace',timezone:'Asia/Dubai'},{ws})).status).toBe(200);
  expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:'Wrong'},{ws})).status).toBe(422);
  expect((await call(workspaceRoute.GET,'GET',undefined,{ws})).status).toBe(200);
  expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:'Updated workspace'},{ws})).status).toBe(200);
  expect((await call(workspaceRoute.GET,'GET',undefined,{ws})).status).toBe(404);
 });
 it('rejects invalid timezone and staff workspace writes',async()=>{
  expect((await call(wsRoute.POST,'POST',{name:'Bad',timezone:'Nowhere/Bad'})).status).toBe(422);
  user=ids.sam;expect((await call(workspaceRoute.PATCH,'PATCH',{name:'No'})).status).toBe(403);
  expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:'Ridgeline Facility Services'})).status).toBe(403);
 });
 it('protects last admin from deletion and demotion; staff can read members',async()=>{
  expect((await call(memberRoute.DELETE,'DELETE',undefined,{userId:ids.imran})).status).toBe(409);
  expect((await call(memberRoute.PATCH,'PATCH',{role:'staff',client_id:null},{userId:ids.imran})).status).toBe(409);
  user=ids.sam;expect((await call(membersRoute.GET)).status).toBe(200);
  expect((await call(memberRoute.PATCH,'PATCH',{role:'admin'},{userId:ids.sam})).status).toBe(403);
 });
 it('normal member management validates client assignment',async()=>{
  const created=await call(wsRoute.POST,'POST',{name:'Membership test'});const ws=created.body.id;
  const joined=await newUser('staff-management@example.test');
  await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ws,joined]));
  expect((await call(memberRoute.PATCH,'PATCH',{role:'client'},{ws,userId:joined})).status).toBe(422);
  expect((await call(memberRoute.PATCH,'PATCH',{role:'admin',client_id:null},{ws,userId:joined})).status).toBe(200);
  expect((await call(memberRoute.PATCH,'PATCH',{role:'staff',client_id:null},{ws,userId:joined})).status).toBe(200);
  expect((await call(memberRoute.DELETE,'DELETE',undefined,{ws,userId:joined})).status).toBe(200);
  expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:'Membership test'},{ws})).status).toBe(200);
 });
});
describe('invite capabilities',()=>{
 it('creates hash-only token, accepts matching email case-insensitively, and reuses for same user',async()=>{
  const recipient=await newUser('INVITEE@example.test');
  const created=await invite('invitee@example.test','invite-replay');
  const replayed=await invite('invitee@example.test','invite-replay');
  expect(replayed.token).toBe(created.token);expect(replayed.id).toBe(created.id);
  const stored=await withUser(ids.imran,async db=>(await db.query('SELECT token_hash FROM invites WHERE id=$1',[created.id])).rows[0]);
  expect(stored.token_hash).toBe(hash(created.token));
  const keys=await withUser(ids.imran,async db=>(await db.query('SELECT result::text FROM idempotency_keys WHERE key=$1',['invite-replay'])).rows);
  expect(keys[0].result).not.toContain(created.token);expect(created.token_hash).toBeUndefined();
  user=recipient;
  expect((await call(meRoute.GET)).body.memberships).toHaveLength(0);
  const accepted=await call(acceptRoute.POST,'POST',{token:created.token});
  expect(accepted.status).toBe(200);expect(accepted.body.status).toBe('accepted');
  expect((await call(acceptRoute.POST,'POST',{token:created.token})).body).toEqual(accepted.body);
  expect((await call(meRoute.GET)).body.memberships).toContainEqual(expect.objectContaining({role:'client',client_id:ids.harbor}));
  user=ids.imran;
  const listed=await call(invitesRoute.GET);expect(listed.body.find((i:{id:string})=>i.id===created.id).status).toBe('accepted');
  expect(JSON.stringify(listed.body)).not.toContain(created.token);
  expect((await call(revokeRoute.POST,'POST',undefined,{id:created.id})).status).toBe(409);
 });
 it('wrong email cannot accept, and matching recipient cannot accept expired or revoked invites',async()=>{
  const recipient=await newUser('expired-recipient@example.test');
  const expired=await invite('expired-recipient@example.test');
  user=ids.sam;expect((await call(acceptRoute.POST,'POST',{token:expired.token})).status).toBe(404);
  user=ids.imran;
  await withUser(ids.imran,db=>db.query("UPDATE invites SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]));
  user=recipient;expect((await call(acceptRoute.POST,'POST',{token:expired.token})).status).toBe(409);
  user=ids.imran;
  expect((await call(invitesRoute.GET)).body.find((i:{id:string})=>i.id===expired.id).status).toBe('expired');
  const revoked=await invite('expired-recipient@example.test');
  expect((await call(revokeRoute.POST,'POST',undefined,{id:revoked.id})).body.status).toBe('revoked');
  user=recipient;expect((await call(acceptRoute.POST,'POST',{token:revoked.token})).status).toBe(409);
  expect((await call(acceptRoute.POST,'POST',{token:'x'.repeat(43)})).status).toBe(404);
 });
 it('staff can list invites but cannot create or revoke them',async()=>{
  const created=await invite('unused@example.test');
  user=ids.sam;expect((await call(invitesRoute.GET)).status).toBe(200);
  expect((await call(invitesRoute.POST,'POST',{email:'staff@example.test',role:'staff'})).status).toBe(403);
  expect((await call(revokeRoute.POST,'POST',undefined,{id:created.id})).status).toBe(403);
 });
});
describe('work order consistency and listing',()=>{
 it('updates with ETag and rejects a stale update with 409; transition writes timeline and notifications',async()=>{
  const order=await newOrder('Lifecycle');
  const changed=await call(orderRoute.PATCH,'PATCH',{status:'scheduled',assignee_id:ids.sam},{id:order.id},'',{'If-Match':'"'+order.updated_at+'"'});
  expect(changed.status).toBe(200);expect(changed.body.status).toBe('scheduled');
  expect((await call(orderRoute.PATCH,'PATCH',{title:'Stale',updated_at:order.updated_at},{id:order.id})).status).toBe(409);
  const detail=await call(orderRoute.GET,'GET',undefined,{id:order.id});
  expect(detail.body.timeline.filter((e:{kind:string})=>e.kind==='status_changed')).toHaveLength(1);
  const notifications=await withUser(ids.imran,async db=>(await db.query('SELECT kind FROM notifications WHERE entity_id=$1',[order.id])).rows);
  expect(notifications).toEqual([]);
  const staffNotifications=await withUser(ids.sam,async db=>(await db.query('SELECT kind FROM notifications WHERE entity_id=$1',[order.id])).rows);
  expect(staffNotifications).toEqual([{kind:'status_changed'}]);
  expect((await call(orderRoute.PATCH,'PATCH',{status:'cancelled',updated_at:changed.body.updated_at},{id:order.id})).status).toBe(200);
 });
 it('invalid transitions are 422 and assignee must be staff/admin of same workspace',async()=>{
  const order=await newOrder('Validation');
  const invalid=await call(orderRoute.PATCH,'PATCH',{status:'done',updated_at:order.updated_at},{id:order.id});
  expect(invalid.status).toBe(422);expect(invalid.body.error.fields.status).toBeDefined();
  for(const assignee_id of [ids.pranav,ids.summitAdmin])expect((await call(orderRoute.PATCH,'PATCH',{assignee_id,updated_at:order.updated_at},{id:order.id})).status).toBe(422);
  expect((await call(orderRoute.PATCH,'PATCH',{title:'No version'},{id:order.id})).status).toBe(422);
 });
 it('idempotency returns original create result and prevents body/key collisions',async()=>{
  const body={title:'Replay order',site_id:siteId(1)};
  const headers={'Idempotency-Key':'order-replay'};
  const first=await call(ordersRoute.POST,'POST',body,{},'',headers);
  const second=await call(ordersRoute.POST,'POST',body,{},'',headers);
  expect(first.status).toBe(201);expect(second.body).toEqual(first.body);
  expect((await call(ordersRoute.POST,'POST',{...body,title:'Different'}, {},'',headers)).status).toBe(409);
  user=ids.sam;const other=await call(ordersRoute.POST,'POST',body,{},'',headers);
  expect(other.status).toBe(201);expect(other.body.id).not.toBe(first.body.id);
 });
 it('workspace, client, site and comment create replays share transactional protection',async()=>{
  const h={'Idempotency-Key':'create-key'};
  const body={name:'Replay workspace'};
  const ws1=await call(wsRoute.POST,'POST',body,{},'',h),ws2=await call(wsRoute.POST,'POST',body,{},'',h);
  expect(ws1.body).toEqual(ws2.body);const ws=ws1.body.id;
  const client1=await call(clientsRoute.POST,'POST',{name:'Replay client'},{ws},'',h);
  const client2=await call(clientsRoute.POST,'POST',{name:'Replay client'},{ws},'',h);expect(client1.body).toEqual(client2.body);
  const site1=await call(sitesRoute.POST,'POST',{name:'Replay site',address:'Road'},{ws,id:client1.body.id},'',h);
  const site2=await call(sitesRoute.POST,'POST',{name:'Replay site',address:'Road'},{ws,id:client1.body.id},'',h);expect(site1.body).toEqual(site2.body);
  const o=await newOrder('Comment replay');
  const comment={body:'Once',visibility:'internal'};
  const c1=await call(commentsRoute.POST,'POST',comment,{id:o.id},'',h);
  const c2=await call(commentsRoute.POST,'POST',comment,{id:o.id},'',h);expect(c1.body).toEqual(c2.body);
  expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:body.name},{ws})).status).toBe(200);
 });
 it('correctly sorts, paginates, filters, searches and returns total count',async()=>{
  const first=await call(ordersRoute.GET,'GET',undefined,{},'?client_id='+ids.northgate+'&status[]=open&status[]=scheduled&priority[]=low&priority[]=normal&sort=title&dir=asc&pageSize=2');
  expect(first.status).toBe(200);expect(first.body.total).toBeGreaterThan(2);
  for(const o of first.body.data) {
   expect(o.client_id).toBe(ids.northgate);expect(['open','scheduled']).toContain(o.status);expect(['low','normal']).toContain(o.priority);
  }
  const base='?client_id='+ids.northgate+'&status[]=open&status[]=scheduled&priority[]=low&priority[]=normal&sort=title&dir=asc&pageSize=2';
  const page=await call(ordersRoute.GET,'GET',undefined,{},base+'&page=2');
  const cursor=await call(ordersRoute.GET,'GET',undefined,{},base+'&cursor='+first.body.next_cursor);
  expect(cursor.body.data).toEqual(page.body.data);
  expect(new Set([...first.body.data,...page.body.data].map(o=>o.id)).size).toBe(4);
  const all=await call(ordersRoute.GET,'GET',undefined,{},base.replace('pageSize=2','pageSize=100'));
  expect(all.body.data.map((o:{title:string})=>o.title)).toEqual([...all.body.data.map((o:{title:string})=>o.title)].sort());
  const search=await call(ordersRoute.GET,'GET',undefined,{},'?q=Routine%20facilities%20request%201&assignee_id='+ids.sam+'&sort=created_at&dir=asc');
  expect(search.status).toBe(200);expect(search.body.total).toBeGreaterThan(0);
  expect(search.body.data.every((o:{description:string;assignee_id:string})=>o.description.includes('Routine facilities request 1') && o.assignee_id===ids.sam)).toBe(true);
  for(const query of ['?pageSize=101','?sort=bad','?status[]=bad','?page=0','?cursor=bad','?cursor=bad&page=1'])expect((await call(ordersRoute.GET,'GET',undefined,{},query)).status).toBe(422);
 });
 it('concurrent identical keys create exactly one work order',async()=>{
  const input={title:'Concurrent replay',site_id:siteId(1)},headers={'Idempotency-Key':'concurrent'};
  const [a,b]=await Promise.all([call(ordersRoute.POST,'POST',input,{},'',headers),call(ordersRoute.POST,'POST',input,{},'',headers)]);
  expect(a.status).toBe(201);expect(b.status).toBe(201);expect(a.body.id).toBe(b.body.id);
 });
});
describe('transaction and lifecycle edge cases',()=>{
 it('follows the full workflow, notifies the client requester, and keeps terminal states closed',async()=>{
  user=ids.pranav;
  const created=await call(ordersRoute.POST,'POST',{title:'Client lifecycle',site_id:siteId(2)});
  expect(created.status).toBe(201);
  user=ids.imran;
  const accepted=await decideSuggestion(ids.imran,ids.ridgeline,created.body.id,{decision:'approved'});
  let current=await getWorkOrder(ids.imran,ids.ridgeline,accepted.work_order_id);
  for(const status of ['scheduled','in_progress','waiting_on_parts','in_progress','done']) {
   const changed=await call(orderRoute.PATCH,'PATCH',{status,assignee_id:ids.sam,updated_at:current.updated_at},{id:current.id});
   expect(changed.status).toBe(200);expect(new Date(changed.body.updated_at).getTime()).toBeGreaterThan(new Date(current.updated_at).getTime());current=changed.body;
  }
  expect((await call(orderRoute.PATCH,'PATCH',{status:'open',updated_at:current.updated_at},{id:current.id})).status).toBe(422);
  user=ids.pranav;
  const detail=await call(orderRoute.GET,'GET',undefined,{id:current.id});
  expect(detail.body.assignee).toEqual({id:ids.sam,name:'Sam',image:null});
  expect(detail.body.timeline.filter((e:{kind:string})=>e.kind==='status_changed')).toHaveLength(5);
  const notifications=await withUser(ids.pranav,async db=>(await db.query('SELECT * FROM notifications WHERE entity_id=$1',[current.id])).rows);
  expect(notifications.filter(n=>n.kind==='status_changed')).toHaveLength(5);
 });
 it('deletes a populated workspace atomically and preserves audit history',async()=>{
  const workspace=(await call(wsRoute.POST,'POST',{name:'Populated workspace'})).body;const ws=workspace.id;
  const client=(await call(clientsRoute.POST,'POST',{name:'Company'},{ws})).body;
  const site=(await call(sitesRoute.POST,'POST',{name:'Site',address:'Road'},{ws,id:client.id})).body;
  const order=await call(ordersRoute.POST,'POST',{title:'Populated delete',client_id:client.id,site_id:site.id},{ws});expect(order.status).toBe(201);
  expect((await call(commentsRoute.POST,'POST',{body:'Delete me',visibility:'internal'},{ws,id:order.body.id})).status).toBe(201);
  expect((await call(invitesRoute.POST,'POST',{email:'delete@example.test',role:'staff'},{ws})).status).toBe(201);
  await withSystem(async db=>{
   await db.query("INSERT INTO supplier_orders(workspace_id,work_order_id,cobalt_ref) VALUES($1,$2,'TEST-DELETE')",[ws,order.body.id]);
   await db.query("INSERT INTO supplier_events(workspace_id,cobalt_ref,event_id,status,received_via) VALUES($1,'TEST-DELETE','DELETE-EVENT','shipped','webhook')",[ws]);
   const imp=(await db.query("INSERT INTO imports(workspace_id,filename,row_count,created_by) VALUES($1,'test.csv',1,$2) RETURNING id",[ws,ids.imran])).rows[0];
   await db.query("INSERT INTO import_rows(workspace_id,import_id,row_number,data,work_order_id,queued) VALUES($1,$2,1,'{}',$3,true)",[ws,imp.id,order.body.id]);
  });
  const dashboard=await call(dashboardRoute.GET,'GET',undefined,{ws});
  expect(dashboard.body.pending_queue_rows).toBe(1);expect(dashboard.body.last_supplier_sync_at).toBeNull();
  expect((await call(orderRoute.PATCH,'PATCH',{status:'scheduled',assignee_id:ids.imran,updated_at:order.body.updated_at},{ws,id:order.body.id})).status).toBe(200);
  expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:workspace.name},{ws})).status).toBe(200);
  const audit=await withSystem(async db=>(await db.query("SELECT action FROM audit_log WHERE workspace_id=$1 AND entity='workspaces'",[ws])).rows);
  expect(audit).toContainEqual({action:'delete'});
  expect((await call(workspaceRoute.GET,'GET',undefined,{ws})).status).toBe(404);
 });
 it('idempotency RLS keeps another user’s results hidden',async()=>{
  const keys=await withUser(ids.pranav,async db=>(await db.query('SELECT user_id FROM idempotency_keys')).rows);
  expect(keys.every((key:{user_id:string})=>key.user_id===ids.pranav)).toBe(true);
  expect(await withUser(ids.pranav,async db=>(await db.query('SELECT user_id FROM idempotency_keys WHERE user_id=$1',[ids.imran])).rows)).toHaveLength(0);
 });
 it('returns neutral field validation for invalid JSON and plain conflicts for referenced deletes',async()=>{
  const malformed=await clientsRoute.POST(new Request('http://localhost/api',{method:'POST',body:'{'}),{params:Promise.resolve({ws:ids.ridgeline})});
  expect(malformed.status).toBe(422);
  const result=await call(clientRoute.DELETE,'DELETE',undefined,{id:ids.harbor});
  expect(result.status).toBe(409);expect(result.body.error.message).not.toMatch(/foreign key|constraint|postgres/i);
 });
});
it('a member with job history is archived instead of deleted, and open jobs are unassigned without losing history',async()=>{
 const ws=(await call(wsRoute.POST,'POST',{name:'Remove assigned member'})).body.id;
 const joined=await newUser('remove-assignee@example.test');
 await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ws,joined]));
 const client=(await call(clientsRoute.POST,'POST',{name:'Company'},{ws})).body;
 const site=(await call(sitesRoute.POST,'POST',{name:'Site',address:'Road'},{ws,id:client.id})).body;
 const order=(await call(ordersRoute.POST,'POST',{title:'Preserve history',site_id:site.id,assignee_id:joined},{ws})).body;
 expect((await call(orderRoute.PATCH,'PATCH',{status:'scheduled',updated_at:order.updated_at},{ws,id:order.id})).status).toBe(200);
 // Rule 17: someone with job history is archived, not deleted.
 expect((await call(memberRoute.DELETE,'DELETE',undefined,{ws,userId:joined})).status).toBe(409);
 await archiveMember(user!,ws,joined);
 const detail=await call(orderRoute.GET,'GET',undefined,{ws,id:order.id});
 expect(detail.status).toBe(200);expect(detail.body.assignee_id).toBeNull();expect(detail.body.timeline).toHaveLength(4);
 expect((await call(workspaceRoute.DELETE,'DELETE',{confirm_name:'Remove assigned member'},{ws})).status).toBe(200);
});
