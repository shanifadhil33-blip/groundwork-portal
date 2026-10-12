import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import * as clientsRoute from '../app/api/workspaces/[ws]/clients/route';
import * as clientRoute from '../app/api/workspaces/[ws]/clients/[id]/route';
import * as sitesRoute from '../app/api/workspaces/[ws]/clients/[id]/sites/route';
import * as siteRoute from '../app/api/workspaces/[ws]/sites/[id]/route';
import * as requestSitesRoute from '../app/api/workspaces/[ws]/request-sites/route';
import * as mcp from '../app/api/mcp/route';
import { createToken } from '../lib/services/tokens';
import { formatPhone, normalizePhone } from '../lib/records';
import { recordSummary } from '../lib/ui/assistant-replies';
import { getWorkOrder } from '../lib/services/work-orders';
import { orderId } from '../scripts/seed';
import type { RouteContext } from '../lib/api';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
let user:string|null=ids.dana;
beforeEach(()=>{user=ids.dana;setAuthResolverForTests(async()=>user);});
afterAll(async()=>{setAuthResolverForTests();await closePools();});
async function call(handler:Handler,method='GET',body?:unknown,params:Record<string,string>={}) {
 const req=new Request('http://localhost/api',{method,headers:{'Content-Type':'application/json',...(method==='POST'?{'Idempotency-Key':crypto.randomUUID()}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await handler(req,{params:Promise.resolve({ws:ids.ridgeline,...params})});
 return {status:response.status,body:await response.json()};
}
async function tool(token:string,name:string,args:unknown={}){
 const r=await mcp.POST(new Request('http://localhost/api/mcp',{method:'POST',headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}})}));
 return JSON.parse(await r.text()).result;
}
const full={name:'Saffron Clinics',contact_name:'Noura Al Ketbi',phone:'050 555 0177',email:'Ops@Saffron.example',billing_building:'Saffron Medical Building, Floor 2',billing_street:'Al Wasl Road',billing_area:'Jumeirah 1',billing_city:'Dubai',billing_region:'Dubai',notes:'Invoices go to the operations team.'};

describe('UAE phone rules (workspace country AE)', () => {
 it('normalizes UAE numbers in any common form and accepts other countries with a + code', () => {
  for (const v of ['+971 50 555 0177','00971 50 555 0177','0505550177','971-50-555-0177','(050) 555 0177']) expect(normalizePhone(v)).toBe('+971505550177');
  expect(normalizePhone('04 555 0198')).toBe('+97145550198');
  expect(normalizePhone('+966 50 123 4567')).toBe('+966501234567');
  for (const v of ['050 555','+971 51 555 0177','+971 50 555 01777','phone','12345678']) expect(normalizePhone(v)).toBeNull();
  expect(formatPhone('+971505550177')).toBe('+971 50 555 0177'); expect(formatPhone('+97145550198')).toBe('+971 4 555 0198');
 });
});

describe('client records', () => {
 it('admins create full client records; values are validated and normalized', async () => {
  const created=await call(clientsRoute.POST,'POST',full);expect(created.status).toBe(201);
  expect(created.body).toMatchObject({name:'Saffron Clinics',contact_name:'Noura Al Ketbi',phone:'+971505550177',email:'ops@saffron.example',billing_region:'Dubai'});
  // Unused columns (old emirate and TRN, and the removed tax number) never reach the API.
  for (const key of ['billing_emirate','trn','tax_id']) expect(created.body).not.toHaveProperty(key);
  const read=await call(clientRoute.GET,'GET',undefined,{id:created.body.id});expect(read.body.billing_area).toBe('Jumeirah 1');
  // A partial edit changes only what was sent; an empty value clears an optional field.
  const patched=await call(clientRoute.PATCH,'PATCH',{phone:'+971 4 555 0111',notes:''},{id:created.body.id});
  expect(patched.status).toBe(200);expect(patched.body).toMatchObject({phone:'+97145550111',notes:null,email:'ops@saffron.example',name:'Saffron Clinics'});
  expect((await call(clientRoute.PATCH,'PATCH',{},{id:created.body.id})).status).toBe(422);
  await call(clientRoute.DELETE,'DELETE',undefined,{id:created.body.id});
 });
 it('only the client name is required, and bad values come back as field errors', async () => {
  const minimal=await call(clientsRoute.POST,'POST',{name:'Name only client'});expect(minimal.status).toBe(201);expect(minimal.body.phone).toBeNull();
  await call(clientRoute.DELETE,'DELETE',undefined,{id:minimal.body.id});
  expect((await call(clientsRoute.POST,'POST',{contact_name:'No name'})).status).toBe(422);
  const bad=await call(clientsRoute.POST,'POST',{name:'Bad values',phone:'050 555',email:'not an email',billing_region:'Muscat'});
  expect(bad.status).toBe(422);expect(Object.keys(bad.body.error.fields).sort()).toEqual(['billing_region','email','phone']);
  expect(bad.body.error.fields.billing_region[0]).toBe('Choose an emirate from the list.');
  // Tax numbers are not part of a client record any more.
  expect((await call(clientsRoute.POST,'POST',{name:'With tax',tax_id:'100234567890003'})).status).toBe(422);
  expect(bad.body.error.fields.phone[0]).toContain('+971 50 123 4567');
  expect((await call(clientsRoute.POST,'POST',{name:'Unknown field',website:'x'})).status).toBe(422);
 });
 it('staff read client details but cannot change them; client users cannot list clients; other workspaces stay hidden', async () => {
  user=ids.sam;
  const list=await call(clientsRoute.GET);expect(list.status).toBe(200);
  expect(list.body.find((c:any)=>c.id===ids.harbor)).toMatchObject({contact_name:'Priya Menon',phone:'+971505550142',billing_region:'Dubai'});
  expect((await call(clientsRoute.POST,'POST',full)).status).toBe(403);
  expect((await call(clientRoute.PATCH,'PATCH',{phone:'+971505550000'},{id:ids.harbor})).status).toBe(403);
  user=ids.priya;expect((await call(clientsRoute.GET)).status).toBe(403);
  user=ids.dana;expect((await call(clientRoute.PATCH,'PATCH',{phone:'+971505550000'},{id:ids.summitClient})).status).toBe(404);
 });
});

describe('site records', () => {
 it('sites carry building, area, access notes and an on-site contact; client users see only the location', async () => {
  const created=await call(sitesRoute.POST,'POST',{name:'Saffron Annex',building:'Building 7',address:'Street 15',area:'Al Barsha 1',access_notes:'Ask security for the plant room key.',contact_name:'Hassan Ali',contact_phone:'055 555 0109'},{id:ids.harbor});
  expect(created.status).toBe(201);expect(created.body).toMatchObject({building:'Building 7',area:'Al Barsha 1',contact_phone:'+971555550109'});
  expect((await call(siteRoute.PATCH,'PATCH',{contact_phone:'12'},{id:created.body.id})).status).toBe(422);
  const patched=await call(siteRoute.PATCH,'PATCH',{access_notes:'Keys at reception.'},{id:created.body.id});expect(patched.body).toMatchObject({access_notes:'Keys at reception.',building:'Building 7'});
  // Only the site name is required.
  const bare=await call(sitesRoute.POST,'POST',{name:'Name only site'},{id:ids.harbor});expect(bare.status).toBe(201);expect(bare.body.address).toBe('');
  expect((await call(sitesRoute.POST,'POST',{address:'No name'},{id:ids.harbor})).status).toBe(422);
  await call(siteRoute.DELETE,'DELETE',undefined,{id:bare.body.id});
  user=ids.priya;const visible=await call(requestSitesRoute.GET);expect(visible.status).toBe(200);
  const seeded=visible.body.find((s:any)=>s.id===siteId(1));expect(seeded).toMatchObject({building:'Marina Exchange, Tower B',area:'Dubai Marina'});
  expect(seeded).not.toHaveProperty('access_notes');expect(seeded).not.toHaveProperty('contact_phone');
  user=ids.dana;await call(siteRoute.DELETE,'DELETE',undefined,{id:created.body.id});
 });
});

describe('work order detail', () => {
 it('client users never get access notes, the site contact or internal client fields through a work order', async () => {
  const own=await getWorkOrder(ids.priya,ids.ridgeline,orderId(1));
  expect(own.site.name).toBeTruthy();expect(own.site).toHaveProperty('building');
  for (const key of ['access_notes','contact_name','contact_phone']) expect(own.site).not.toHaveProperty(key);
  for (const key of ['notes','tax_id','phone','billing_region','country','trn','billing_emirate']) expect(own.client).not.toHaveProperty(key);
  const staff=await getWorkOrder(ids.sam,ids.ridgeline,orderId(1));
  expect(staff.site).toHaveProperty('access_notes');expect(staff.client).toHaveProperty('billing_region');for (const key of ['tax_id','trn','billing_emirate']) expect(staff.client).not.toHaveProperty(key);
 });
});

describe('agent and assistant tools', () => {
 it('admins create and update clients through MCP; staff are refused; client tokens list sites without access notes', async () => {
  const admin=await createToken(ids.dana,ids.ridgeline,{name:'Records',scope:'write'});
  const made=await tool(admin.token,'create_client',{name:'Tool made client',phone:'+971 50 555 0190',billing_region:'Ajman'});
  expect(made.isError).toBeUndefined();expect(made.structuredContent.result).toMatchObject({phone:'+971505550190',billing_region:'Ajman'});
  const updated=await tool(admin.token,'update_client',{id:made.structuredContent.result.id,notes:'Tool note'});
  expect(updated.structuredContent.result).toMatchObject({notes:'Tool note',phone:'+971505550190'});
  const staff=await createToken(ids.sam,ids.ridgeline,{name:'Records staff',scope:'write'});
  expect((await tool(staff.token,'create_client',{name:'Staff try'})).isError).toBe(true);
  const client=await createToken(ids.priya,ids.ridgeline,{name:'Records client',scope:'read'});
  const sites=(await tool(client.token,'list_sites')).structuredContent.result;
  expect(sites.length).toBeGreaterThan(0);expect(sites[0]).not.toHaveProperty('access_notes');expect(sites[0]).toHaveProperty('building');
  await call(clientRoute.DELETE,'DELETE',undefined,{id:made.structuredContent.result.id});
  const listed=await mcp.POST(new Request('http://localhost/api/mcp',{method:'POST',headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json',Authorization:'Bearer '+admin.token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})}));
  const create=JSON.parse(await listed.text()).result.tools.find((t:any)=>t.name==='create_client');
  expect(Object.keys(create.inputSchema.properties)).toEqual(expect.arrayContaining(['name','contact_name','phone','email','billing_region','country','notes']));
  expect(create.inputSchema.properties).not.toHaveProperty('tax_id');
 });
 it('confirmation cards show each change, readable', () => {
  expect(recordSummary('update_client',{id:'x',phone:'+97145550111',notes:null},{label:'Harbor & Pine Coworking',record:{phone:'+971505550142',notes:'Old note'},country:'AE'}))
   .toBe('Update client Harbor & Pine Coworking:\nPhone: +971 50 555 0142 → +971 4 555 0111\nNotes: Old note → None');
  expect(recordSummary('create_site',{client_id:'x',name:'Saffron Annex',address:'Street 15',contact_name:'Hassan Ali'},{label:'Harbor & Pine Coworking'}))
   .toBe('Add site “Saffron Annex” for Harbor & Pine Coworking\nAddress: Street 15\nSite contact: Hassan Ali');
 });
});
