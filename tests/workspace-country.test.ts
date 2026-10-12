import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { setAuthResolverForTests } from '../lib/auth';
import { closePools, withSystem, withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import * as wsRoute from '../app/api/workspaces/route';
import * as settingsRoute from '../app/api/workspaces/[ws]/settings/route';
import * as clientsRoute from '../app/api/workspaces/[ws]/clients/route';
import * as clientRoute from '../app/api/workspaces/[ws]/clients/[id]/route';
import * as sitesRoute from '../app/api/workspaces/[ws]/clients/[id]/sites/route';
import * as mcp from '../app/api/mcp/route';
import { createToken } from '../lib/services/tokens';
import { countryOptions, currencyFor, formatMoney, formatPhone, guessCountry, normalizePhone, normalizeRegion, phoneHint, regionField } from '../lib/countries/rules';
import { COUNTRIES, GCC_FIRST } from '../lib/countries/data';
import { recordSummary } from '../lib/ui/assistant-replies';
import type { RouteContext } from '../lib/api';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;

describe('country rules (data driven)', () => {
 it('lists the GCC first, in order, then every other country by name, searchable by aliases', () => {
  const options=countryOptions();
  expect(options.slice(0,6).map(o=>o.value)).toEqual([...GCC_FIRST]);
  expect(options[6].divider).toBe(true);
  const rest=options.slice(6).map(o=>o.label);expect([...rest].sort((a,b)=>a.localeCompare(b))).toEqual(rest);
  expect(options.length).toBeGreaterThan(240);
  expect(options.find(o=>o.value==='SA')!.keywords).toContain('KSA');
 });
 it('uses each country’s own region level, label and list', () => {
  expect(regionField('AE')).toMatchObject({label:'Emirate'});expect(regionField('AE').options).toHaveLength(7);
  expect(regionField('SA').label).toBe('Region');expect(regionField('SA').options).toHaveLength(13);
  expect(regionField('OM').label).toBe('Governorate');expect(regionField('OM').options).toHaveLength(11);
  expect(regionField('QA').label).toBe('Municipality');expect(regionField('QA').options).toHaveLength(8);
  expect(regionField('BH')).toMatchObject({label:'Governorate'});expect(regionField('KW').options).toHaveLength(6);
  expect(regionField('IN').label).toBe('State');expect(regionField('US').options).toHaveLength(51);
  expect(regionField('GB')).toEqual({label:'County',options:undefined});
  expect(regionField('FR')).toEqual({label:'Region',options:undefined});
  expect(normalizeRegion('eastern province','SA')).toBe('Eastern Province');expect(normalizeRegion('Dubai','SA')).toBeNull();
  expect(normalizeRegion('  Île de France ','FR')).toBe('Île de France');
 });
 it('reads local phone numbers in the record’s country and checks each GCC plan', () => {
  expect(normalizePhone('050 123 4567','SA')).toBe('+966501234567');expect(normalizePhone('011 234 5678','SA')).toBe('+966112345678');
  expect(normalizePhone('9123 4567','OM')).toBe('+96891234567');expect(normalizePhone('0912 34567','OM')).toBeNull();
  expect(normalizePhone('3312 3456','QA')).toBe('+97433123456');expect(normalizePhone('3600 1234','BH')).toBe('+97336001234');
  expect(normalizePhone('5000 1234','KW')).toBe('+96550001234');expect(normalizePhone('050 555 0177','AE')).toBe('+971505550177');
  // Another country's number with its + code is fine anywhere; a GCC code with a broken number is not.
  expect(normalizePhone('+971 50 555 0177','OM')).toBe('+971505550177');expect(normalizePhone('+966 40 123','AE')).toBeNull();
  expect(normalizePhone('+33 1 42 68 53 00','SA')).toBe('+33142685300');
  expect(normalizePhone('020 7946 0000','FR')).toBeNull();
  expect(formatPhone('+966501234567')).toBe('+966 50 123 4567');expect(formatPhone('+96891234567')).toBe('+968 9123 4567');
  expect(phoneHint('SA')).toBe('+966 50 123 4567');expect(phoneHint('OM')).toBe('+968 9123 4567');
 });
 it('has a currency for every GCC country and formats money in it', () => {
  expect(GCC_FIRST.map(c=>currencyFor(c))).toEqual(['AED','SAR','OMR','QAR','BHD','KWD']);
  expect(formatMoney(1250.5,'SAR','en')).toContain('SAR');expect(formatMoney(12.5,'OMR','en')).toMatch(/12\.500/);
  for (const [code,c] of Object.entries(COUNTRIES)) if (c.phone) expect(c.dial,code).toBeTruthy();
 });
 it('guesses the country from the browser timezone, and falls back to the UAE', () => {
  expect(guessCountry('Asia/Riyadh')).toBe('SA');expect(guessCountry('Asia/Muscat')).toBe('OM');expect(guessCountry('America/Chicago')).toBe('US');expect(guessCountry('Europe/Paris')).toBe('AE');
 });
});

// A fresh real user per run, so these new workspaces never change another test's first membership.
const founder=randomUUID();let user:string|null=founder;const made:string[]=[];
beforeAll(async()=>{await withSystem(db=>db.query("INSERT INTO users(id,name,email) VALUES($1,'Faisal Al Harbi',$2)",[founder,`faisal.${founder.slice(0,8)}@riyadhfm.example`]));});
beforeEach(()=>{user=founder;setAuthResolverForTests(async()=>user);});
// Clean up the way an admin would: delete each workspace, then the throwaway user (best effort: audit rows may keep it).
afterAll(async()=>{for(const ws of made)await withUser(founder,db=>db.query('SELECT delete_workspace($1)',[ws]));await withSystem(db=>db.query('DELETE FROM users WHERE id=$1',[founder])).catch(()=>{});setAuthResolverForTests();await closePools();});
async function call(handler:Handler,method='GET',body?:unknown,params:Record<string,string>={}) {
 const req=new Request('http://localhost/api',{method,headers:{'Content-Type':'application/json',...(method==='POST'?{'Idempotency-Key':randomUUID()}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await handler(req,{params:Promise.resolve(params)});
 return {status:response.status,body:await response.json()};
}

describe('signup in Saudi Arabia and Oman', () => {
 it('saves the country, region and currency on the new workspace, and the app follows them', async () => {
  const sa=await call(wsRoute.POST,'POST',{name:'Riyadh Facility Partners',timezone:'Asia/Riyadh',country:'SA',region:'riyadh'});
  expect(sa.status).toBe(201);made.push(sa.body.id);
  expect(sa.body).toMatchObject({name:'Riyadh Facility Partners',country:'SA',region:'Riyadh',currency:'SAR'});
  const ws=sa.body.id;
  // Clients default to the workspace country: Saudi numbers and regions.
  const client=await call(clientsRoute.POST,'POST',{name:'Olaya Towers Management',phone:'050 123 4567',billing_city:'Riyadh',billing_region:'Riyadh'},{ws});
  expect(client.status).toBe(201);expect(client.body).toMatchObject({phone:'+966501234567',billing_region:'Riyadh',country:null});
  const bad=await call(clientsRoute.POST,'POST',{name:'Wrong country terms',billing_region:'Dubai',phone:'050 12'},{ws});
  expect(bad.status).toBe(422);expect(bad.body.error.fields.billing_region[0]).toBe('Choose a region from the list.');
  expect(bad.body.error.fields.phone[0]).toContain('+966 50 123 4567');
  // A client billed in another country: its own country's rules.
  const uae=await call(clientsRoute.POST,'POST',{name:'Dubai branch office',country:'AE',phone:'04 555 0198',billing_region:'Dubai'},{ws});
  expect(uae.status).toBe(201);expect(uae.body).toMatchObject({country:'AE',phone:'+97145550198',billing_region:'Dubai'});
  // Back to the workspace country: an emirate is no longer a valid region.
  expect((await call(clientRoute.PATCH,'PATCH',{country:null,billing_region:'Dubai'},{ws,id:uae.body.id})).status).toBe(422);
  // Sites follow their client's country.
  const site=await call(sitesRoute.POST,'POST',{name:'Olaya Tower 2',address:'King Fahd Road',region:'Riyadh',contact_phone:'055 555 0101'},{ws,id:client.body.id});
  expect(site.status).toBe(201);expect(site.body).toMatchObject({region:'Riyadh',contact_phone:'+966555550101'});
  expect((await call(sitesRoute.POST,'POST',{name:'Wrong',address:'x',region:'Muscat'},{ws,id:client.body.id})).status).toBe(422);
  // The assistant's MCP view of the workspace.
  const token=await createToken(founder,ws,{name:'Country',scope:'read'});
  const r=await mcp.POST(new Request('http://localhost/api/mcp',{method:'POST',headers:{Accept:'application/json, text/event-stream','Content-Type':'application/json',Authorization:'Bearer '+token.token},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'whoami',arguments:{}}})}));
  expect(JSON.parse(await r.text()).result.structuredContent.result).toMatchObject({workspace_country:'SA',workspace_region:'Riyadh',currency:'SAR'});
 });
 it('an Oman workspace uses governorates and +968 numbers; Settings can change it later', async () => {
  const om=await call(wsRoute.POST,'POST',{name:'Muscat Building Care',timezone:'Asia/Muscat',country:'OM'});
  expect(om.status).toBe(201);made.push(om.body.id);expect(om.body).toMatchObject({country:'OM',region:null,currency:'OMR'});
  const ws=om.body.id;
  const client=await call(clientsRoute.POST,'POST',{name:'Qurum Heights',phone:'9123 4567',billing_region:'Muscat'},{ws});
  expect(client.status).toBe(201);expect(client.body).toMatchObject({phone:'+96891234567',billing_region:'Muscat'});
  expect((await call(settingsRoute.PATCH,'PATCH',{region:'Dhofar'},{ws})).status).toBe(200);
  // A new country drops the old region and, when not picked by hand, takes that country's currency in the UI.
  const moved=await call(settingsRoute.PATCH,'PATCH',{country:'QA',currency:'QAR'},{ws});
  expect(moved.status).toBe(200);expect(moved.body).toMatchObject({country:'QA',region:null,currency:'QAR'});
  expect((await call(settingsRoute.PATCH,'PATCH',{region:'Muscat'},{ws})).status).toBe(422);
  expect((await call(settingsRoute.PATCH,'PATCH',{country:'XX'},{ws})).status).toBe(422);
  expect((await call(settingsRoute.PATCH,'PATCH',{currency:'ABC'},{ws})).status).toBe(422);
  expect((await call(settingsRoute.GET,'GET',undefined,{ws})).body).toMatchObject({country:'QA',currency:'QAR'});
 });
 it('rejects a region that is not on the country list, and keeps other workspaces out', async () => {
  const bad=await call(wsRoute.POST,'POST',{name:'Wrong region',country:'SA',region:'Dubai'});
  expect(bad.status).toBe(422);expect(bad.body.error.fields.region[0]).toBe('Choose a region from the list.');
  // Not a member: another workspace's settings and clients stay hidden.
  expect((await call(settingsRoute.PATCH,'PATCH',{country:'OM'},{ws:ids.ridgeline})).status).toBe(404);
  expect((await call(clientsRoute.GET,'GET',undefined,{ws:ids.ridgeline})).status).toBe(404);
  // Staff cannot change the workspace country.
  user=ids.sam;expect((await call(settingsRoute.PATCH,'PATCH',{country:'OM'},{ws:ids.ridgeline})).status).toBe(403);
 });
 it('the demo workspace stays in the UAE', async () => {
  user=ids.dana;const s=await call(settingsRoute.GET,'GET',undefined,{ws:ids.ridgeline});
  expect(s.body).toMatchObject({country:'AE',region:'Dubai',currency:'AED'});
 });
});

describe('a real new signup starts empty', () => {
 it('creates the workspace and its founder only, never demo or seeded records', async () => {
  const fresh=await call(wsRoute.POST,'POST',{name:'Brand New Facilities',timezone:'Asia/Dubai',country:'AE'});
  expect(fresh.status).toBe(201);made.push(fresh.body.id);expect(fresh.body.is_demo).toBe(false);
  const counts=await withSystem(async c=>Object.fromEntries(await Promise.all(['work_orders','clients','sites','imports','notifications','invites','api_tokens','supplier_orders','comments','work_order_events'].map(async t=>[t,Number((await c.query(`SELECT count(*) FROM ${t} WHERE workspace_id=$1`,[fresh.body.id])).rows[0].count)]))));
  expect(counts).toEqual({work_orders:0,clients:0,sites:0,imports:0,notifications:0,invites:0,api_tokens:0,supplier_orders:0,comments:0,work_order_events:0});
  const members=await withSystem(async c=>(await c.query('SELECT user_id,role FROM members WHERE workspace_id=$1',[fresh.body.id])).rows);
  expect(members).toEqual([{user_id:founder,role:'admin'}]);
 });
});

describe('signup asks only country, region and company name', () => {
 it('the onboarding page has three steps and no tax field', async () => {
  const src=(await import('node:fs')).readFileSync('app/(app)/onboarding/page.tsx','utf8');
  expect(src).toContain("const STEPS = ['Country', 'Region', 'Company'] as const;");
  expect(src.toLowerCase()).not.toMatch(/tax|trn|vat/);
 });
});

describe('assistant confirmation cards use the record’s country terms', () => {
 it('labels the region for Saudi and Oman records', () => {
  expect(recordSummary('create_client',{name:'Olaya Towers',billing_region:'Riyadh',country:null},{label:'Olaya Towers',country:'SA'}))
   .toBe('Add client “Olaya Towers”\nRegion: Riyadh');
  expect(recordSummary('update_client',{id:'x',billing_region:'Dhofar'},{label:'Qurum Heights',record:{billing_region:'Muscat'},country:'OM'})).toBe('Update client Qurum Heights:\nGovernorate: Muscat → Dhofar');
  expect(recordSummary('update_client',{id:'x',country:'AE'},{label:'Branch',record:{country:null},country:'AE'})).toBe('Update client Branch:\nCountry: Same as workspace → United Arab Emirates');
 });
});
