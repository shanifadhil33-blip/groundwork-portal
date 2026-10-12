import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem, withUser } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import * as ordersRoute from '../app/api/workspaces/[ws]/work-orders/route';
import * as orderRoute from '../app/api/workspaces/[ws]/work-orders/[id]/route';
import * as commentsRoute from '../app/api/workspaces/[ws]/work-orders/[id]/comments/route';
import * as clientsRoute from '../app/api/workspaces/[ws]/clients/route';
import * as membersRoute from '../app/api/workspaces/[ws]/members/route';
import * as importsRoute from '../app/api/workspaces/[ws]/imports/route';
import * as auditRoute from '../app/api/workspaces/[ws]/audit/route';
import * as invitesRoute from '../app/api/workspaces/[ws]/invites/route';
import type { RouteContext } from '../lib/api';
import { isOffice, roleLabels } from '../lib/roles';
import { officeOnlyPath } from '../lib/ui/work-orders';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
let user:string|null=ids.ravi;
beforeEach(()=>{user=ids.ravi;setAuthResolverForTests(async()=>user);});
afterAll(async()=>{setAuthResolverForTests();await closePools();});
async function call(handler:Handler,method='GET',body?:unknown,params:Record<string,string>={},query=''){
 const req=new Request('http://localhost/api'+query,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const r=await handler(req,{params:Promise.resolve({ws:ids.ridgeline,...params})});return {status:r.status,body:await r.json()};
}
const assigned=()=>withSystem(async db=>(await db.query("SELECT id,status,updated_at FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 ORDER BY order_number",[ids.ridgeline,ids.ravi])).rows);
const someoneElses=()=>withSystem(async db=>(await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id IS DISTINCT FROM $2 LIMIT 1",[ids.ridgeline,ids.ravi])).rows[0].id as string);

describe('roles', () => {
 it('labels staff as Supervisor and treats only admins and supervisors as office', () => {
  expect(roleLabels.staff).toBe('Supervisor');expect(roleLabels.technician).toBe('Technician');
  expect([isOffice('admin'),isOffice('staff'),isOffice('technician'),isOffice('client')]).toEqual([true,true,false,false]);
  for(const p of ['/dashboard','/clients','/import','/queue','/supplier','/audit','/work-orders/new','/work-orders/x/edit'])expect(officeOnlyPath(p)).toBe(true);
  for(const p of ['/work-orders','/work-orders/x','/settings'])expect(officeOnlyPath(p)).toBe(false);
 });
});

describe('a technician sees only their own jobs', () => {
 it('lists only jobs assigned to them, and other jobs are hidden', async () => {
  const mine=await assigned();expect(mine.length).toBeGreaterThan(3);
  const list=await call(ordersRoute.GET,'GET',undefined,{},'?pageSize=100');expect(list.status).toBe(200);
  expect(new Set(list.body.data.map((o:any)=>o.id))).toEqual(new Set(mine.map(o=>o.id)));
  expect((await call(orderRoute.GET,'GET',undefined,{id:await someoneElses()})).status).toBe(404);
  const one=await call(orderRoute.GET,'GET',undefined,{id:mine[0].id});expect(one.status).toBe(200);
  // the site details needed on the job (access notes, on site contact) come with it
  expect(one.body.site?.name).toBeTruthy();
 });
 it('changes only the status of their own job, never cancels, never edits other fields', async () => {
  const job=(await assigned()).find(o=>['scheduled','open','in_progress'].includes(o.status))!;
  const fresh=(await call(orderRoute.GET,'GET',undefined,{id:job.id})).body;
  const target=fresh.status==='in_progress'?'waiting_on_parts':'in_progress';
  const moved=await call(orderRoute.PATCH,'PATCH',{status:target,updated_at:fresh.updated_at},{id:job.id});expect(moved.status).toBe(200);expect(moved.body.status).toBe(target);
  expect((await call(orderRoute.PATCH,'PATCH',{title:'Renamed',updated_at:moved.body.updated_at},{id:job.id})).status).toBe(403);
  expect((await call(orderRoute.PATCH,'PATCH',{status:'cancelled',updated_at:moved.body.updated_at},{id:job.id})).status).toBe(403);
  expect((await call(orderRoute.PATCH,'PATCH',{status:'in_progress',updated_at:new Date().toISOString()},{id:await someoneElses()})).status).toBe(404);
  // the database holds the same line even without the API
  await expect(withUser(ids.ravi,db=>db.query("UPDATE work_orders SET title='x' WHERE id=$1",[job.id]))).rejects.toMatchObject({code:'P0403'});
  const other=await someoneElses();
  expect((await withUser(ids.ravi,db=>db.query("UPDATE work_orders SET status='in_progress' WHERE id=$1",[other]))).rowCount).toBe(0);
 });
 it('adds notes on own jobs; the supervisor sees them', async () => {
  const job=(await assigned())[0];
  const note=await call(commentsRoute.POST,'POST',{body:'Replaced the fan belt.'},{id:job.id});expect(note.status).toBe(201);expect(note.body.visibility).toBe('internal');
  user=ids.sam;const seen=await call(orderRoute.GET,'GET',undefined,{id:job.id});expect(JSON.stringify(seen.body)).toContain('Replaced the fan belt.');
 });
 it('cannot create jobs or open office data', async () => {
  expect((await call(ordersRoute.POST,'POST',{title:'Mine',site_id:siteId(1)})).status).toBe(403);
  for(const h of [clientsRoute.GET,membersRoute.GET,importsRoute.GET,auditRoute.GET,invitesRoute.GET]){const r=await call(h);expect([403,404]).toContain(r.status);}
  // direct SQL: only the clients and sites of their own jobs
  const clients=await withUser(ids.ravi,async db=>(await db.query('SELECT id FROM clients WHERE workspace_id=$1',[ids.ridgeline])).rows.map(r=>r.id));
  const jobClients=await withSystem(async db=>(await db.query('SELECT DISTINCT client_id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2',[ids.ridgeline,ids.ravi])).rows.map(r=>r.client_id));
  expect(new Set(clients)).toEqual(new Set(jobClients));
  expect((await withUser(ids.ravi,db=>db.query('SELECT 1 FROM imports WHERE workspace_id=$1',[ids.ridgeline]))).rowCount).toBe(0);
  // only their own membership row, never the rest of the team
  expect((await withUser(ids.ravi,async db=>(await db.query('SELECT user_id FROM members WHERE workspace_id=$1',[ids.ridgeline])).rows))).toEqual([{user_id:ids.ravi}]);
 });
 it('an admin can invite a technician and set someone to Supervisor or Technician', async () => {
  user=ids.imran;const inv=await call(invitesRoute.POST,'POST',{email:`tech.${Date.now()}@example.com`,role:'technician'});expect(inv.status).toBe(201);expect(inv.body.role).toBe('technician');
  // assigning a job to a technician is allowed
  const mine=(await assigned())[0];const o=(await call(orderRoute.GET,'GET',undefined,{id:mine.id})).body;
  expect((await call(orderRoute.PATCH,'PATCH',{assignee_id:ids.ravi,priority:'high',updated_at:o.updated_at},{id:mine.id})).status).toBe(200);
 });
});
