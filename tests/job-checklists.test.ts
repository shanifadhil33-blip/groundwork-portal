import { afterAll, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { createWorkOrder } from '../lib/services/work-orders';
import { checklistTemplates, saveChecklistTemplate, jobChecklist, saveJobChecklist } from '../lib/services/job-checklists';
import { templateInput, progressInput } from '../lib/job-checklists';
const ws=ids.ridgeline;
afterAll(closePools);
async function job(){return createWorkOrder(ids.imran,ws,{title:'Check cooling',site_id:siteId(1),trade:'ac',assignee_id:ids.ravi});}
it('owner and supervisor set templates; office, technician, clients and household cannot',async()=>{
 for(const user of [ids.imran,ids.sam]) await saveChecklistTemplate(user,ws,{trade:'ac',steps:['Clean the filter','Check cooling']});
 expect((await checklistTemplates(ids.sam,ws)).ac).toEqual(['Clean the filter','Check cooling']);
 for(const user of [ids.nabil,ids.ravi,ids.pranav,ids.faisal]){
  await expect(saveChecklistTemplate(user,ws,{trade:'ac',steps:[]})).rejects.toMatchObject({status:403});
  await expect(checklistTemplates(user,ws)).rejects.toMatchObject({status:403});
 }
});
it('assigned technician ticks and records parts; snapshots survive template edits and reports',async()=>{
 await saveChecklistTemplate(ids.sam,ws,{trade:'ac',steps:['Clean the filter','Check cooling']});
 const j=await job();
 await saveJobChecklist(ids.ravi,ws,j.id,{action:'tick',step:'Clean the filter',done:true});
 await saveChecklistTemplate(ids.sam,ws,{trade:'ac',steps:['New step']});
 const body={action:'add_material',name:'Capacitor',quantity:2,note:'Outdoor unit'};
 const first=await saveJobChecklist(ids.ravi,ws,j.id,body,'one');
 const again=await saveJobChecklist(ids.ravi,ws,j.id,body,'one');
 expect(again).toEqual(first);expect(first.materials).toHaveLength(1);expect(first.steps).toHaveLength(2);
 for(const user of [ids.imran,ids.sam,ids.pranav]){
  const view=await jobChecklist(user,ws,j.id);expect(view.steps[0].done).toBe(true);expect(view.materials[0].quantity).toBe(2);
 }
 await saveJobChecklist(ids.ravi,ws,j.id,{action:'remove_material',material_id:first.materials[0].id});
 expect((await jobChecklist(ids.ravi,ws,j.id)).materials).toEqual([]);
 await withSystem(db=>db.query("UPDATE work_orders SET status='scheduled' WHERE id=$1",[j.id]),ids.imran);
 const {saveJobReport}=await import('../lib/services/job-report');
 const current=await withSystem(async db=>(await db.query('SELECT updated_at FROM work_orders WHERE id=$1',[j.id])).rows[0]);
 await saveJobReport(ids.ravi,ws,j.id,{outcome:'fixed',updated_at:new Date(current.updated_at).toISOString()});
 expect((await jobChecklist(ids.pranav,ws,j.id)).steps[0].done).toBe(true);
 await expect(saveJobChecklist(ids.ravi,ws,j.id,body)).rejects.toMatchObject({status:409});
});
it('other technicians, clients, households, office and other workspaces cannot edit',async()=>{
 const j=await job();
 // Sam has a technician role only for this test and is not assigned to Ravi jobs.
 await withSystem(db=>db.query("UPDATE members SET role='technician' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 for(const user of [ids.sam,ids.pranav,ids.faisal,ids.nabil,ids.summitAdmin])await expect(saveJobChecklist(user,ws,j.id,{action:'add_material',name:'Washer',quantity:1})).rejects.toMatchObject({status:403});
 await expect(jobChecklist(ids.summitAdmin,ws,j.id)).rejects.toMatchObject({status:404});
 await withSystem(db=>db.query("UPDATE members SET role='staff' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
});
it('validates bounds, unknown steps and maximum materials',async()=>{
 for(const steps of [Array.from({length:13},(_,i)=>'Step '+i),['a'.repeat(81)],[''],['Test','test']])expect(templateInput.safeParse({trade:'ac',steps}).success).toBe(false);
 for(const quantity of [0,-1,100001,Infinity])expect(progressInput.safeParse({action:'add_material',name:'Part',quantity}).success).toBe(false);
 expect(progressInput.safeParse({action:'add_material',name:'x'.repeat(81),quantity:1}).success).toBe(false);
 expect(progressInput.safeParse({action:'add_material',name:'Part',quantity:1,note:'x'.repeat(201)}).success).toBe(false);
 expect(progressInput.safeParse({action:'add_material',name:'Part',quantity:1,price:10}).success).toBe(false);
 const j=await job();await expect(saveJobChecklist(ids.ravi,ws,j.id,{action:'tick',step:'Unknown',done:true})).rejects.toMatchObject({status:422});
 for(let n=0;n<30;n++)await saveJobChecklist(ids.ravi,ws,j.id,{action:'add_material',name:'Washer',quantity:1});
 await expect(saveJobChecklist(ids.ravi,ws,j.id,{action:'add_material',name:'Washer',quantity:1})).rejects.toMatchObject({status:422});
});
it('both demo paths seed templates and filled snapshots using the shared fixture',async()=>{
 const {populateChecklistFixture}=await import('../lib/fixture-checklists');
 await withSystem(db=>populateChecklistFixture(db,ws,ids.imran),ids.imran);
 const templates=await checklistTemplates(ids.imran,ws);
 const {TRADES}=await import('../lib/trades');
 for(const trade of TRADES)expect(templates[trade].length).toBeGreaterThan(0);
 const saved=await withSystem(async db=>(await db.query("SELECT details FROM work_order_events WHERE workspace_id=$1 AND kind='job_checklist'",[ws])).rows);
 expect(saved.some(r=>r.details.steps.some((s:{done:boolean})=>s.done)&&r.details.materials.length>0)).toBe(true);
 for(const path of ['lib/fixture.ts','lib/fixture-dune-harbour.ts'])expect(readFileSync(path,'utf8')).toContain('await populateChecklistFixture(');
});
it('every checklist label, default step and server message has every language key',()=>{
 const keys=['Checklists','Job type','Use up to twelve short steps. Saved jobs keep their steps.','Step','Move up','Move down','Add step','Use suggested steps','Save checklist','Checklist','steps done','No steps set for this job type.','Materials used','No materials recorded.','Material name','Quantity','Notes','Add material','Clean the filter','Check the drain','Check cooling','Check for leaks','Clean the work area','Check water flow','Test the repair','Switch off the power','Check the wiring','You cannot change checklists.','You cannot change this job.','Open the job and choose a checklist step.','Use up to thirty materials.','Checklist and materials saved.','Used during the visit','Capacitor','Washer','Cable clip'];
 for(const file of readdirSync('public/i18n').filter(f=>f.endsWith('.json'))){
  const dictionary=JSON.parse(readFileSync('public/i18n/'+file,'utf8'));
  for(const key of keys){expect(dictionary[key],file+': '+key).toBeTruthy();expect(typeof dictionary[key]).toBe('string');}
 }
});

it('agent requires confirmation, then enforces assignment again at save time',async()=>{
 const {callTool}=await import('../lib/agent/tools');
 const j=await job(),context={user:ids.ravi,ws,scope:'write' as const,kind:'assistant' as const};
 const args={id:j.id,name:'Capacitor',quantity:2};
 expect((await callTool(context,'add_job_material',args)).structuredContent).toMatchObject({error:{code:'confirmation_required'}});
 const saved=await callTool({...context,approved:true},'add_job_material',args);
 expect(saved.isError).toBeUndefined();
 expect((await jobChecklist(ids.ravi,ws,j.id)).materials[0]).toMatchObject({name:'Capacitor',quantity:2});
 await withSystem(db=>db.query('UPDATE work_orders SET assignee_id=$2 WHERE id=$1',[j.id,ids.imran]),ids.imran);
 expect((await callTool({...context,approved:true},'add_job_material',args)).structuredContent).toMatchObject({error:{code:'forbidden'}});
});

it('agent reads preserve all twelve step names and page through materials without losing quantities',async()=>{
 const {callTool}=await import('../lib/agent/tools');
 const {compactSnapshot}=await import('../lib/ai');
 await saveChecklistTemplate(ids.imran,ws,{trade:'ac',steps:Array.from({length:12},(_,i)=>'Check item '+i)});
 const j=await job();for(let n=0;n<7;n++)await saveJobChecklist(ids.ravi,ws,j.id,{action:'add_material',name:'Washer',quantity:n+1});
 const context={user:ids.sam,ws,scope:'read' as const,kind:'assistant' as const};
 const first=await callTool(context,'get_job_checklist',{id:j.id});
 const data=(first.structuredContent as any).result;
 expect(Object.keys(data.steps)).toHaveLength(12);expect(data.materials).toHaveLength(6);expect(data.total_materials).toBe(7);
 expect(Object.keys(compactSnapshot(first).result.steps)).toHaveLength(12);
 const second=await callTool(context,'get_job_checklist',{id:j.id,page:2});
 expect((second.structuredContent as any).result.materials.map((m:any)=>m.quantity)).toEqual([7]);
});
