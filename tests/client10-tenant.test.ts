import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
vi.mock('web-push',()=>({default:{setVapidDetails:()=>{},sendNotification:async()=>({})}}));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { createWorkOrder,getWorkOrder,listWorkOrders,patchWorkOrder } from '../lib/services/work-orders';
import { createSuggestion,decideSuggestion,listSuggestions } from '../lib/services/suggestions';
import { callTool } from '../lib/agent/tools';
import { closePools,withSystem } from '../lib/db';
import { errorResponse } from '../lib/http';
import { ids,siteId } from '../lib/fixture';
const ws=ids.ridgeline,tenant={tenant_unit:'1204',tenant_name:'Hassan',tenant_phone:'+971 50 000 1204'};
const jobs:string[]=[],suggestions:string[]=[],actions:string[]=[];
let household:any;
beforeEach(async()=>{
 vi.mocked(assistantTurn).mockReset();
 household=await withSystem(async db=>(await db.query('SELECT client_id,client_kind FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,ids.faisal])).rows[0]);
});
afterEach(async()=>{
 await withSystem(async db=>{
  await db.query('UPDATE members SET client_id=$3,client_kind=$4 WHERE workspace_id=$1 AND user_id=$2',[ws,ids.faisal,household.client_id,household.client_kind]);
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.pranav]);
  await db.query('DELETE FROM assistant_actions WHERE id=ANY($1::uuid[])',[actions.splice(0)]);
  await db.query('DELETE FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND result->>\'id\'=ANY($3::text[])',[ids.pranav,ws+'/suggestions',suggestions]);
  await db.query("DELETE FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND result->'request'->>'id'=ANY($3::text[])",[ids.pranav,ws+'/emergencies',jobs]);
  await db.query('DELETE FROM notifications WHERE entity_id=ANY($1::uuid[])',[[...suggestions,...jobs]]);
  await db.query('DELETE FROM job_suggestions WHERE id=ANY($1::uuid[])',[suggestions.splice(0)]);
  for(const table of ['comments','work_order_events','job_photos'])await db.query(`DELETE FROM ${table} WHERE work_order_id=ANY($1::uuid[])`,[jobs]);
  await db.query('DELETE FROM work_orders WHERE id=ANY($1::uuid[])',[jobs.splice(0)]);
 });
});
afterAll(closePools);
async function request(){
 const s:any=await createWorkOrder(ids.pranav,ws,{title:'Repair bedroom fan',description:'The bedroom fan is noisy',site_id:siteId(1),tenant_unit:' 1204 ',tenant_name:' Hassan ',tenant_phone:' +971 50 000 1204 '});
 suggestions.push(s.id);return s;
}
async function approved(){
 const s=await request();const decision=await decideSuggestion(ids.sam,ws,s.id,{decision:'approved'});jobs.push(decision.work_order_id);
 return patchWorkOrder(ids.sam,ws,decision.work_order_id,{assignee_id:ids.ravi,updated_at:new Date((await getWorkOrder(ids.sam,ws,decision.work_order_id)).updated_at).toISOString()});
}
async function bad400(p:Promise<unknown>,message?:string){
 try{await p;throw new Error('Expected refusal');}catch(e){expect(errorResponse(e).status).toBe(400);if(message)expect(e).toMatchObject({message});}
}
it('Pranav forwards tenant details and approval copies them onto the job',async()=>{
 const s=await request();expect(s).toMatchObject(tenant);
 expect((await listSuggestions(ids.pranav,ws)).data.find(r=>r.id===s.id)).toMatchObject(tenant);
 const d=await decideSuggestion(ids.sam,ws,s.id,{decision:'approved'});jobs.push(d.work_order_id);
 expect(await getWorkOrder(ids.sam,ws,d.work_order_id)).toMatchObject(tenant);
});
it.each([ids.faisal,ids.kevin])('refuses tenant fields from household or client office %s',async user=>{
 const body={title:'Repair bedroom fan',site_id:siteId(user===ids.faisal?4:1),...tenant};
 await bad400(createWorkOrder(user,ws,body),'Only a building manager can add a tenant.');
 await bad400(createSuggestion(user,ws,body),'Only a building manager can add a tenant.');
});
it('Ravi cannot create or change tenant details',async()=>{
 const o=await approved();
 await expect(patchWorkOrder(ids.ravi,ws,o.id,{tenant_unit:'1205',updated_at:new Date(o.updated_at).toISOString()})).rejects.toMatchObject({status:403});
 await expect(createSuggestion(ids.ravi,ws,{title:'Repair bedroom fan',site_id:siteId(1),tenant_unit:'1205'})).rejects.toMatchObject({status:403});
 expect(await getWorkOrder(ids.sam,ws,o.id)).toMatchObject(tenant);
});
it('staff, assigned technician and client manager see all tenant fields in detail, lists and tools',async()=>{
 const o=await approved();
 for(const actor of [ids.imran,ids.sam,ids.nabil,ids.ravi,ids.pranav]){
  expect(await getWorkOrder(actor,ws,o.id)).toMatchObject(tenant);
  expect((await listWorkOrders(actor,ws,new URLSearchParams({q:o.title}))).data.find(r=>r.id===o.id)).toMatchObject(tenant);
  expect(await callTool({user:actor,ws,scope:'read',kind:'assistant'},'get_work_order',{id:o.id})).toMatchObject({structuredContent:{result:expect.objectContaining(tenant)}});
 }
});
it('household and office members who can see a job get its unit without tenant contacts',async()=>{
 const o=await approved();
 await withSystem(db=>db.query('UPDATE members SET client_id=$3 WHERE workspace_id=$1 AND user_id=$2',[ws,ids.faisal,ids.harbor]));
 for(const actor of [ids.faisal,ids.kevin]){
  // Household visibility is limited to his own jobs; preserve all fixture ownership.
  if(actor===ids.faisal)await withSystem(db=>db.query('UPDATE work_orders SET created_by=$2 WHERE id=$1',[o.id,actor]));
  const detail=await getWorkOrder(actor,ws,o.id);
  const listed=(await listWorkOrders(actor,ws,new URLSearchParams({q:o.title}))).data.find(r=>r.id===o.id);
  for(const value of [detail,listed]){expect(value).toMatchObject({tenant_unit:'1204'});expect(value).not.toHaveProperty('tenant_name');expect(value).not.toHaveProperty('tenant_phone');}
  const tool=await callTool({user:actor,ws,scope:'read',kind:'assistant'},'get_work_order',{id:o.id});
  expect(JSON.stringify(tool)).not.toMatch(/tenant_name|tenant_phone|Hassan|971 50/);
 }
});
it('staff and office staff can create tenant jobs and blank values become null',async()=>{
 for(const actor of [ids.sam,ids.nabil]){
  const o=await createWorkOrder(actor,ws,{title:'Repair bedroom fan',site_id:siteId(1),...tenant});jobs.push(o.id);expect(o).toMatchObject(tenant);
 }
 const s=await createSuggestion(ids.pranav,ws,{title:'Repair bedroom fan',site_id:siteId(1),tenant_unit:' ',tenant_name:' ',tenant_phone:''});suggestions.push(s.id);
 expect(s).toMatchObject({tenant_unit:null,tenant_name:null,tenant_phone:null});
});
it('agent create_request saves the unit after Pranav confirms',async()=>{
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{id:'a',name:'create_request',args:{title:'Repair bedroom fan',description:'The bedroom fan is noisy',site_id:siteId(1),tenant_unit:'1204'}}]} as any).mockResolvedValue({calls:[],text:'Please confirm the request.'} as any);
 const r:any=await assistant(ids.pranav,ws,{messages:[{role:'user',content:'This is for flat 1204. The bedroom fan is noisy at Marina Exchange.'}]});
 expect(r.pending_action).toBeTruthy();actions.push(r.pending_action.id);
 const done:any=await assistant(ids.pranav,ws,{messages:[],confirm_action_id:r.pending_action.id});
 expect(done.result.isError).not.toBe(true);const saved=done.result.structuredContent.result;suggestions.push(saved.id);expect(saved).toMatchObject({tenant_unit:'1204'});
});
it.each([{tenant_phone:'abc'},{tenant_unit:'1'.repeat(41)},{tenant_name:'a'.repeat(81)},{tenant_phone:'1'.repeat(31)},{tenant_phone:'12+34'}])('refuses invalid tenant fields with 400: %j',async fields=>{
 const body={title:'Repair bedroom fan',site_id:siteId(1),...fields};
 await bad400(createWorkOrder(ids.pranav,ws,body));await bad400(createSuggestion(ids.pranav,ws,body));
});
it('suggestion lists and agent results strip contacts for household and office senders',async()=>{
 const s=await request();
 await withSystem(db=>db.query('UPDATE members SET client_id=$3 WHERE workspace_id=$1 AND user_id=$2',[ws,ids.faisal,ids.harbor]));
 for(const actor of [ids.kevin,ids.faisal]){
  await withSystem(db=>db.query('UPDATE job_suggestions SET sender_user_id=$2 WHERE id=$1',[s.id,actor]));
  const value=(await listSuggestions(actor,ws)).data.find(r=>r.id===s.id);
  expect(value).toMatchObject({tenant_unit:'1204'});expect(value).not.toHaveProperty('tenant_name');expect(value).not.toHaveProperty('tenant_phone');
  const result=await callTool({user:actor,ws,scope:'read',kind:'assistant'},'list_suggestions',{});
  expect(JSON.stringify(result)).not.toMatch(/tenant_name|tenant_phone|Hassan|971 50/);
  const refused=await callTool({user:actor,ws,scope:'write',kind:'assistant'},'create_request',{title:'Bedroom fan',description:'The bedroom fan is noisy',site_id:siteId(1),tenant_unit:'1204'});
  expect(refused).toMatchObject({isError:true,structuredContent:{error:{message:'Only a building manager can add a tenant.'}}});
 }
});
it('an urgent manager request also preserves tenant details',async()=>{
 const made:any=await createWorkOrder(ids.pranav,ws,{title:'Water flooding the flat',description:'Water is flooding the flat from a burst pipe',site_id:siteId(1),...tenant});
 const job=made.request;expect(job).toMatchObject(tenant);jobs.push(job.id);
});
it('database checks protect both tables independently of service validation',async()=>{
 const s=await request(),o=await approved();
 for(const [table,id] of [['job_suggestions',s.id],['work_orders',o.id]])for(const [column,value] of [['tenant_unit','x'.repeat(41)],['tenant_name','x'.repeat(81)],['tenant_phone','x'],['tenant_phone','1'.repeat(31)]]){
  await expect(withSystem(db=>db.query(`UPDATE ${table} SET ${column}=$2 WHERE id=$1`,[id,value]))).rejects.toMatchObject({code:'23514'});
 }
});
it('rollback drops exactly the six added columns',()=>{
 const sql=readFileSync('db/rollbacks/rollback-0059_tenant_requests.sql','utf8');
 expect(sql.trim().split(';').filter(Boolean).map(s=>s.trim())).toEqual([
 'ALTER TABLE job_suggestions DROP COLUMN tenant_unit, DROP COLUMN tenant_name, DROP COLUMN tenant_phone',
 'ALTER TABLE work_orders DROP COLUMN tenant_unit, DROP COLUMN tenant_name, DROP COLUMN tenant_phone',
 ]);
});
