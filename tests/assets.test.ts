import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
vi.mock('web-push',()=>({default:{setVapidDetails:()=>{},sendNotification:async()=>({})}}));
import { assetHistory, createAsset, getAsset, listAssets, updateAsset } from '../lib/services/assets';
import { createWorkOrder, getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { inWorkspace } from '../lib/services/shared';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { setAuthResolverForTests } from '../lib/auth';
import { GET, POST } from '../app/api/workspaces/[ws]/assets/route';
import { GET as detail, PATCH } from '../app/api/workspaces/[ws]/assets/[id]/route';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
const cleanupTables=['company_action_approvals','assistant_actions','work_order_events','comments','notifications','work_orders','assets','audit_log'] as const;
let baseline:Record<string,string[]>;
const ws=ids.ridgeline,units:string[]=[],jobs:string[]=[],cards:string[]=[];
beforeEach(async()=>{baseline={};await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);for(const table of cleanupTables)baseline[table]=(await db.query(`SELECT id FROM ${table} WHERE workspace_id=$1`,[ws])).rows.map(r=>r.id);});});
afterAll(closePools);
afterEach(async()=>{setAuthResolverForTests();vi.mocked(assistantTurn).mockReset();await withSystem(async db=>{
 await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
 for(const table of cleanupTables)await db.query(`DELETE FROM ${table} WHERE workspace_id=$1 AND NOT(id=ANY($2::uuid[]))`,[ws,baseline[table]]);
 cards.length=0;jobs.length=0;units.length=0;
});});
async function unit(user=ids.imran,site=siteId(1),fields:Record<string,unknown>={}){const a=await createAsset(user,ws,{site_id:site,name:'Test roof unit',kind:'ac',...fields});units.push(a.id);return a;}
async function job(asset:string|null,extra:Record<string,unknown>={}){const j:any=await createWorkOrder(ids.imran,ws,{site_id:siteId(1),title:'Test unit visit',asset_id:asset,assignee_id:ids.ravi,...extra});jobs.push(j.id);return j;}
it('admin creates, edits and archives with audit history',async()=>{
 const a=await unit();expect(a.created_by).toBe(ids.imran);
 const b=await updateAsset(ids.imran,ws,a.id,{name:'Roof AC 3',location:'Roof',installed_on:'2026-01-10'});expect(b).toMatchObject({name:'Roof AC 3',location:'Roof',kind:'ac',installed_on:'2026-01-10'});
 await updateAsset(ids.imran,ws,a.id,{archived_at:new Date().toISOString()});
 expect((await listAssets(ids.imran,ws)).some(a=>a.id===b.id)).toBe(false);
 expect((await listAssets(ids.imran,ws,{include_archived:true})).some(a=>a.id===b.id)).toBe(true);
 const logs=await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);return (await db.query("SELECT action FROM audit_log WHERE workspace_id=$1 AND entity='assets' AND entity_id=$2 ORDER BY at",[ws,a.id])).rows;});expect(logs.map(l=>l.action)).toEqual(['insert','update','update']);
});
it('supervisor creates and edits; office staff read but cannot manage',async()=>{const a=await unit(ids.sam);await updateAsset(ids.sam,ws,a.id,{notes:'Check each year.'});expect((await listAssets(ids.nabil,ws)).some(x=>x.id===a.id)).toBe(true);await expect(createAsset(ids.nabil,ws,{site_id:siteId(1),name:'No',kind:'pump'})).rejects.toMatchObject({status:403});await expect(updateAsset(ids.nabil,ws,a.id,{name:'No'})).rejects.toMatchObject({status:403});});
it('technician cannot create and sees equipment only on assigned jobs',async()=>{
 const a=await unit();await expect(createAsset(ids.ravi,ws,{site_id:siteId(1),name:'No',kind:'pump'})).rejects.toMatchObject({status:403});
 expect((await listAssets(ids.ravi,ws)).some(x=>x.id===a.id)).toBe(false);const j=await job(a.id);expect((await getWorkOrder(ids.ravi,ws,j.id)).asset).toEqual({id:a.id,name:a.name,kind:'ac'});expect((await listAssets(ids.ravi,ws)).some(x=>x.id===a.id)).toBe(true);
 await expect(patchWorkOrder(ids.ravi,ws,j.id,{asset_id:null,updated_at:j.updated_at.toISOString()})).rejects.toMatchObject({status:403});
 await expect(updateAsset(ids.ravi,ws,a.id,{name:'No'})).rejects.toMatchObject({status:403});
});
it('facility manager sees only his client units and their visible job history',async()=>{
 const a=await unit(),other=await unit(ids.imran,siteId(4));const j=await job(a.id);
 const visible=await listAssets(ids.pranav,ws);expect(visible.some(x=>x.id===a.id)).toBe(true);expect(visible.some(x=>x.id===other.id)).toBe(false);
 expect(await assetHistory(ids.pranav,ws,a.id)).toEqual([expect.objectContaining({id:j.id,title:j.title,technician_name:'Ravi',status:'open',outcome:null,finished_at:null})]);
 expect((await listAssets(ids.omar,ws)).some(x=>x.id===a.id)).toBe(false);
 await expect(getAsset(ids.omar,ws,a.id)).rejects.toMatchObject({status:404});
 for(const user of [ids.faisal,ids.kevin]){expect(await listAssets(user,ws)).toEqual([]);await expect(assetHistory(user,ws,a.id)).rejects.toMatchObject({status:404});}
 await expect(updateAsset(ids.pranav,ws,a.id,{name:'No'})).rejects.toMatchObject({status:403});
});
it('household and facility staff get only the name on their own visible job',async()=>{
 const a=await unit(),house=await unit(ids.imran,siteId(4));const j=await job(a.id);const h=await job(house.id,{site_id:siteId(4)});
 await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);await db.query('UPDATE work_orders SET created_by=$2 WHERE id=$1',[j.id,ids.kevin]);await db.query('UPDATE work_orders SET created_by=$2 WHERE id=$1',[h.id,ids.faisal]);});
 for(const [user,id,asset] of [[ids.kevin,j.id,a],[ids.faisal,h.id,house]] as const)expect((await getWorkOrder(user,ws,id)).asset).toEqual({name:asset.name});
 const other=await job(a.id);expect((await getWorkOrder(ids.kevin,ws,other.id)).asset).toBeNull();
});
it('refuses an asset at another site with plain 422 on create and edit',async()=>{const a=await unit(ids.imran,siteId(4));await expect(job(a.id)).rejects.toMatchObject({status:422,message:'That unit is at a different site.'});const j=await job(null);await expect(patchWorkOrder(ids.imran,ws,j.id,{asset_id:a.id,updated_at:j.updated_at.toISOString()})).rejects.toMatchObject({status:422,message:'That unit is at a different site.'});});
it('links and clears equipment when editing a job and rejects archived units',async()=>{const a=await unit();const j=await job(null);const saved=await patchWorkOrder(ids.imran,ws,j.id,{asset_id:a.id,updated_at:j.updated_at.toISOString()});expect((await getWorkOrder(ids.imran,ws,j.id)).asset.id).toBe(a.id);await patchWorkOrder(ids.imran,ws,j.id,{asset_id:null,updated_at:saved.updated_at.toISOString()});await updateAsset(ids.imran,ws,a.id,{archived_at:new Date().toISOString()});await expect(job(a.id)).rejects.toMatchObject({status:422});});
it('RLS hides units across workspaces even when queried directly; no DELETE grant',async()=>{
 const a=await unit();expect(await listAssets(ids.summitAdmin,ids.summit)).toEqual([]);
 const r=await inWorkspace(ids.summitAdmin,ids.summit,async c=>(await c.db.query('SELECT id FROM assets WHERE workspace_id=$1',[ws])).rows);expect(r).toEqual([]);
 await expect(inWorkspace(ids.summitAdmin,ids.summit,c=>c.db.query('INSERT INTO assets(workspace_id,site_id,name,kind) VALUES($1,$2,$3,$4)',[ws,siteId(1),'No','ac']))).rejects.toMatchObject({code:'42501'});
 await expect(inWorkspace(ids.imran,ws,c=>c.db.query('DELETE FROM assets WHERE id=$1',[a.id]))).rejects.toMatchObject({code:'42501'});
});
it('database refuses a different site link even without service validation',async()=>{const a=await unit(ids.imran,siteId(4));const j=await job(null);await expect(inWorkspace(ids.imran,ws,c=>c.db.query('UPDATE work_orders SET asset_id=$2 WHERE id=$1',[j.id,a.id]))).rejects.toMatchObject({code:'23503'});});
it('history lists newest jobs first with completed date and outcome',async()=>{
 const a=await unit(),first=await job(a.id),second=await job(a.id);
 await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);await db.query("UPDATE work_orders SET created_at='2026-01-01',status='done',report_at='2026-01-02T00:00:00Z',report_outcome='fixed' WHERE id=$1",[first.id]);await db.query("UPDATE work_orders SET created_at='2026-02-01' WHERE id=$1",[second.id]);});
 const h=await assetHistory(ids.pranav,ws,a.id);expect(h.map(j=>j.id)).toEqual([second.id,first.id]);expect(h[1]).toMatchObject({outcome:'fixed',status:'done',finished_at:new Date('2026-01-02')});
});
it('validates lengths, types and partial edits without clearing other fields',async()=>{
 await expect(unit(ids.imran,siteId(1),{name:' '})).rejects.toThrow('Enter a name.');await expect(unit(ids.imran,siteId(1),{notes:'x'.repeat(501)})).rejects.toThrow('Use 500 characters or fewer.');
 const a=await unit(ids.imran,siteId(1),{make:'Daikin',serial:'S1'});expect(await updateAsset(ids.imran,ws,a.id,{location:'Roof'})).toMatchObject({make:'Daikin',serial:'S1',location:'Roof'});
});
it('API list, create, detail and patch follow authentication and validation',async()=>{
 setAuthResolverForTests(async()=>ids.imran);const ctx={params:Promise.resolve({ws})};
 const r=await POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({site_id:siteId(1),name:'API unit',kind:'pump'})}),ctx);expect(r.status).toBe(200);const a=await r.json();units.push(a.id);
 expect((await (await GET(new Request(`http://localhost/api?site_id=${siteId(1)}`),ctx)).json()).some((x:any)=>x.id===a.id)).toBe(true);
 const target={params:Promise.resolve({ws,id:a.id})};expect(await (await detail(new Request('http://localhost/api'),target)).json()).toMatchObject({history:[],name:'API unit'});
 expect((await PATCH(new Request('http://localhost/api',{method:'PATCH',body:JSON.stringify({location:'Roof'})}),target)).status).toBe(200);
 expect((await POST(new Request('http://localhost/api',{method:'POST',body:'bad'}),ctx)).status).toBe(422);
 setAuthResolverForTests(async()=>ids.ravi);expect((await POST(new Request('http://localhost/api',{method:'POST',body:'{}'}),ctx)).status).toBe(403);
});
it.each([ids.imran,ids.sam])('agent prepares a plain add equipment card for %s and writes only on confirmation',async user=>{
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{id:'asset',name:'add_asset',args:{site_id:siteId(1),name:'Roof test AC',kind:'ac'}}]} as any).mockResolvedValueOnce({calls:[],text:'Please confirm.'} as any);
 const before=(await listAssets(ids.imran,ws)).length;
 const r:any=await assistant(user,ws,{messages:[{role:'user',content:'Add Roof test AC at Marina Exchange'}]});expect(r.pending_action).toBeTruthy();cards.push(r.pending_action.id);expect(r.pending_action.summary).toBe("Add AC unit 'Roof test AC' at Marina Exchange");expect((await listAssets(ids.imran,ws)).length).toBe(before);
 const confirmed:any=await assistant(user,ws,{messages:[],confirm_action_id:r.pending_action.id});
 const made=(await listAssets(ids.imran,ws)).find(a=>a.name==='Roof test AC');expect(made).toBeTruthy();units.push(made!.id);expect(confirmed.reply).toContain('Added');
});

it('rollback and reapply preserve the earlier schema in a local transaction',async()=>{
 await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);await db.query('SAVEPOINT assets_rollback_test');
  try{
   await db.query(await readFile('db/rollbacks/rollback-0056_assets.sql','utf8'));
   expect((await db.query("SELECT to_regclass('public.assets') AS table_name")).rows[0].table_name).toBeNull();
   expect((await db.query("SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='asset_id'")).rows).toEqual([]);
   await db.query(await readFile('db/migrations/0056_assets.sql','utf8'));
   expect((await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='assets'::regclass")).rows[0]).toEqual({relrowsecurity:true,relforcerowsecurity:true});
  }finally{await db.query('ROLLBACK TO SAVEPOINT assets_rollback_test');}
 });
});
it('workspace cleanup removes equipment after jobs and keeps its audit history',async()=>{
 await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);await db.query('SAVEPOINT assets_cleanup_test');
  try{
   const workspace=randomUUID(),client=randomUUID(),site=randomUUID();
   await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Equipment cleanup test')",[workspace]);
   await db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'admin')",[workspace,ids.imran]);
   await db.query("INSERT INTO clients(id,workspace_id,name) VALUES($1,$2,'Test client')",[client,workspace]);
   await db.query("INSERT INTO sites(id,workspace_id,client_id,name,address) VALUES($1,$2,$3,'Test site','Roof')",[site,workspace,client]);
   const asset=(await db.query("INSERT INTO assets(workspace_id,site_id,name,kind,created_by) VALUES($1,$2,'Test AC','ac',$3) RETURNING id",[workspace,site,ids.imran])).rows[0].id;
   await db.query("INSERT INTO work_orders(workspace_id,site_id,client_id,title,asset_id,created_by) VALUES($1,$2,$3,'Test job',$4,$5)",[workspace,site,client,asset,ids.imran]);
   await db.query('SELECT delete_workspace_data($1)',[workspace]);
   expect((await db.query('SELECT id FROM assets WHERE workspace_id=$1',[workspace])).rows).toEqual([]);
   expect((await db.query('SELECT id FROM workspaces WHERE id=$1',[workspace])).rows).toEqual([]);
   expect((await db.query("SELECT action FROM audit_log WHERE workspace_id=$1 AND entity='assets' ORDER BY action",[workspace])).rows.map(r=>r.action)).toEqual(['delete','insert']);
  }finally{await db.query('ROLLBACK TO SAVEPOINT assets_cleanup_test');}
 });
});
