import { afterAll, beforeEach, expect, it, vi } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../scripts/seed';
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { createWorkOrder, getWorkOrder, patchWorkOrder } from '../lib/services/work-orders';
import { canCancelVisit, freeVisitSlots, prepareClientVisit, previousTechnician } from '../lib/services/client-visits';
import { createSuggestion, decideSuggestion } from '../lib/services/suggestions';
import { suggestWorkers } from '../lib/services/assign';
import { callTool } from '../lib/agent/tools';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
const ws=ids.ridgeline;
const day=new Date(Date.UTC(2032,0,12)).toISOString().slice(0,10);
const at=(hour:number,minute=0)=>new Date(Date.UTC(2032,0,12,hour,minute)).toISOString();
const localAt=(hour:number,minute=0)=>at(hour-4,minute);
afterAll(closePools);
beforeEach(async()=>{
 vi.mocked(assistantTurn).mockReset();
 await withSystem(async db=>{
  await db.query("UPDATE workspaces SET working_days=ARRAY[0,1,2,3,4,5,6],working_hours=jsonb_build_object('start','09:00','end','17:00') WHERE id=$1",[ws]);
  await db.query("UPDATE members SET off_days=ARRAY[]::smallint[],trades=ARRAY['plumbing'] WHERE workspace_id=$1 AND user_id=$2",[ws,ids.ravi]);
  await db.query('DELETE FROM time_off WHERE workspace_id=$1 AND user_id=$2',[ws,ids.ravi]);
  await db.query("UPDATE work_orders SET status='cancelled' WHERE workspace_id=$1 AND scheduled_for>=$2::date AND status NOT IN ('done','cancelled')",[ws,day]);
 });
});
async function job(user=ids.pranav){
 const o=await createWorkOrder(ids.imran,ws,{title:'Repair tap',site_id:siteId(user===ids.faisal?4:1),assignee_id:ids.ravi,scheduled_for:localAt(10),trade:'plumbing'});
 await withSystem(db=>db.query('UPDATE work_orders SET created_by=$2 WHERE id=$1',[o.id,user]));
 return getWorkOrder(user,ws,o.id);
}
const version=(o:any)=>new Date(o.updated_at).toISOString();
async function leave(){await withSystem(db=>db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,created_by,status) VALUES($1,$2,'leave',$3,$3,$4,'approved')",[ws,ids.ravi,day,ids.imran]));}
async function confirm(user:string,p:any){return assistant(user,ws,{messages:[],confirm_action_id:p.pending_action.id}) as Promise<any>;}

it('offers exactly the requested free time and never changes the job before Yes',async()=>{
 const o=await job();
 const r=await freeVisitSlots(ids.pranav,ws,{id:o.id,day,time:'11:15'});
 expect(r.slots).toEqual([localAt(11,15)]);
 const p:any=await prepareClientVisit(ids.pranav,ws,'reschedule_visit',{id:o.id,scheduled_for:r.slots[0],updated_at:r.updated_at});
 expect(p.pending_action.summary).toContain('11:15');
 expect(new Date((await getWorkOrder(ids.pranav,ws,o.id)).scheduled_for).toISOString()).toBe(localAt(10));
 await confirm(ids.pranav,p);
 expect(new Date((await getWorkOrder(ids.pranav,ws,o.id)).scheduled_for).toISOString()).toBe(localAt(11,15));
 const result=await withSystem(async db=>({notices:(await db.query("SELECT user_id FROM notifications WHERE entity_id=$1 AND kind='visit_changed'",[o.id])).rows,audit:(await db.query("SELECT actor_id,actor_kind FROM audit_log WHERE entity='work_orders' AND entity_id=$1 AND actor_id=$2 AND action='update'",[o.id,ids.pranav])).rows}));
 expect(result.notices.map(r=>r.user_id)).toEqual(expect.arrayContaining([ids.ravi,ids.sam,ids.imran]));
 expect(result.audit).toContainEqual({actor_id:ids.pranav,actor_kind:'assistant'});
});
it('offers at most three slots inside workspace hours and outside overlapping jobs',async()=>{
 const o=await job();
 await withSystem(db=>db.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,assignee_id,scheduled_for,created_by) VALUES($1,$2,$3,'Another tap','scheduled',$4,$5,$6)",[ws,ids.harbor,siteId(1),ids.ravi,localAt(9,30),ids.imran]));
 const r=await freeVisitSlots(ids.pranav,ws,{id:o.id,day,period:'morning'});
 expect(r.slots).toHaveLength(3);
 expect(r.slots[0]).toBe(localAt(10,30));
 for(const slot of r.slots){const h=Number(new Intl.DateTimeFormat('en',{hour:'2-digit',hourCycle:'h23',timeZone:'Asia/Dubai'}).format(new Date(slot)));expect(h).toBeGreaterThanOrEqual(9);expect(h).toBeLessThan(12);}
 const p=prepareClientVisit(ids.pranav,ws,'reschedule_visit',{id:o.id,scheduled_for:localAt(16,30),updated_at:version(o)});
 await expect(p).rejects.toMatchObject({status:422});
});
it('excludes weekly off days, approved leave and workspace closed days',async()=>{
 const o=await job();
 const weekday=new Date(at(12)).getUTCDay();
 await withSystem(db=>db.query('UPDATE members SET off_days=$3 WHERE workspace_id=$1 AND user_id=$2',[ws,ids.ravi,[weekday]]));
 let r=await freeVisitSlots(ids.pranav,ws,{id:o.id,day,time:'11:00'});
 expect(r.slots).not.toContain(localAt(11));
 await withSystem(db=>db.query('UPDATE members SET off_days=ARRAY[]::smallint[] WHERE workspace_id=$1 AND user_id=$2',[ws,ids.ravi]));
 await leave();r=await freeVisitSlots(ids.pranav,ws,{id:o.id,day,time:'11:00'});expect(r.slots.every(s=>s.slice(0,10)!==day)).toBe(true);
 await withSystem(db=>db.query('UPDATE workspaces SET working_days=$2 WHERE id=$1',[ws,[(weekday+1)%7]]));
 r=await freeVisitSlots(ids.pranav,ws,{id:o.id,day});expect(r.slots.every(s=>new Date(s).getUTCDay()===(weekday+1)%7)).toBe(true);
});
it.each([ids.pranav,ids.kevin,ids.faisal])('each client persona can move his own job and sees no other client job',async user=>{
 const o=await job(user);
 const other=user===ids.faisal?ids.pranav:ids.faisal;
 await expect(freeVisitSlots(other,ws,{id:o.id,day})).rejects.toMatchObject({status:404});
 await expect(prepareClientVisit(other,ws,'cancel_visit',{id:o.id,updated_at:version(o)})).rejects.toMatchObject({status:404});
 expect((await freeVisitSlots(user,ws,{id:o.id,day})).slots.length).toBeGreaterThan(0);
});
it('refuses another request from the same client company',async()=>{
 const o=await job(ids.pranav);
 await expect(freeVisitSlots(ids.kevin,ws,{id:o.id,day})).rejects.toMatchObject({status:404});
});
it('cancels only after confirmation and notifies the technician and supervisors with client audit',async()=>{
 const o=await job(ids.kevin);
 const p=await prepareClientVisit(ids.kevin,ws,'cancel_visit',{id:o.id,updated_at:version(o)});
 expect((await getWorkOrder(ids.kevin,ws,o.id)).status).toBe('scheduled');
 await confirm(ids.kevin,p);expect((await getWorkOrder(ids.kevin,ws,o.id)).status).toBe('cancelled');
 const n=await withSystem(db=>db.query("SELECT user_id FROM notifications WHERE entity_id=$1 AND kind='job_cancelled'",[o.id]));expect(n.rows.map(r=>r.user_id)).toEqual(expect.arrayContaining([ids.ravi,ids.sam,ids.imran]));
 const a=await withSystem(db=>db.query("SELECT actor_id,actor_kind FROM audit_log WHERE entity_id=$1 AND entity='work_orders' AND actor_id=$2",[o.id,ids.kevin]));expect(a.rows).toContainEqual({actor_id:ids.kevin,actor_kind:'assistant'});
});
it.each(['in_progress','waiting_on_parts','travel'])('refuses cancellation for %s and asks the supervisor to call',async status=>{
 const o=await job(ids.faisal);
 await withSystem(db=>status==='travel'?db.query('UPDATE work_orders SET on_way_at=now() WHERE id=$1',[o.id]):db.query('UPDATE work_orders SET status=$2 WHERE id=$1',[o.id,status]));
 const p:any=await prepareClientVisit(ids.faisal,ws,'cancel_visit',{id:o.id,updated_at:version(o)});
 expect(p.reply).toBe('Ravi is already on the way. I asked the supervisor to call you.');expect(p.pending_action).toBeUndefined();
 const n=await withSystem(db=>db.query("SELECT user_id FROM notifications WHERE entity_id=$1 AND kind='client_callback'",[o.id]));expect(n.rows.map(r=>r.user_id)).toEqual(expect.arrayContaining([ids.sam,ids.imran]));expect(n.rows.map(r=>r.user_id)).not.toContain(ids.ravi);
});
it('maps the real statuses conservatively',()=>{
 for(const status of ['open','scheduled'])expect(canCancelVisit({status})).toBe(true);
 for(const status of ['in_progress','waiting_on_parts','done','cancelled'])expect(canCancelVisit({status})).toBe(false);
 expect(canCancelVisit({status:'scheduled',on_way_at:at(9)})).toBe(false);
});
it('rechecks leave when a card is confirmed',async()=>{
 const o=await job();const p:any=await prepareClientVisit(ids.pranav,ws,'reschedule_visit',{id:o.id,scheduled_for:localAt(11),updated_at:version(o)});
 await leave();const r=await confirm(ids.pranav,p);expect(r.result.isError).toBe(true);expect(new Date((await getWorkOrder(ids.pranav,ws,o.id)).scheduled_for).toISOString()).toBe(localAt(10));
});
it('Agent presents server choices and a confirmation card using a mocked model',async()=>{
 const o=await job();
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{name:'free_visit_slots',args:{id:o.id,day,period:'morning'},id:'slots'}]} as any);
 const choices:any=await assistant(ids.pranav,ws,{messages:[{role:'user',content:'Can you move it to Saturday morning?'}]});expect(choices.choices).toHaveLength(3);
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{name:'reschedule_visit',args:{id:o.id,scheduled_for:localAt(11),updated_at:version(o)},id:'move'}]} as any);
 const p:any=await assistant(ids.pranav,ws,{messages:[{role:'user',content:choices.choices[0]}]});expect(p.pending_action.tool).toBe('reschedule_visit');expect(vi.mocked(assistantTurn)).toHaveBeenCalledTimes(1);expect((await getWorkOrder(ids.pranav,ws,o.id)).status).toBe('scheduled');
 const direct=await callTool({user:ids.pranav,ws,scope:'write',kind:'assistant'},'reschedule_visit',{id:o.id,scheduled_for:localAt(11),updated_at:version(o)});expect(direct.structuredContent).toMatchObject({error:{code:'confirmation_required'}});
});
it('saves the same technician preference, carries it to the job and ranks it first only when eligible',async()=>{
 const o=await job(ids.faisal);
 await withSystem(db=>db.query("UPDATE work_orders SET status='done' WHERE id=$1",[o.id]));
 expect(await previousTechnician(ids.faisal,ws)).toMatchObject({user_id:ids.ravi,name:'Ravi'});
 const s=await createSuggestion(ids.faisal,ws,{title:'Leaking tap',site_id:siteId(4),problem:'The tap leaks again',preferred_window:'Morning',same_technician:true});expect(s.preferred_technician_id).toBe(ids.ravi);
 const accepted=await decideSuggestion(ids.sam,ws,s.id,{decision:'approved'});const id=accepted.work_order_id;
 await withSystem(db=>db.query("UPDATE work_orders SET trade='plumbing',scheduled_for=$2 WHERE id=$1",[id,localAt(12)]));
 let ranked=await suggestWorkers(ids.nabil,ws,id);expect(ranked.workers[0].user_id).toBe(ids.ravi);expect(ranked.preference_reason).toContain('again');
 await leave();ranked=await suggestWorkers(ids.nabil,ws,id);expect(ranked.preference_reason).toContain('on leave');expect(ranked.workers.find(w=>w.user_id===ids.ravi).off).toBeTruthy();
 const j=await getWorkOrder(ids.imran,ws,id);await expect(patchWorkOrder(ids.imran,ws,id,{assignee_id:ids.ravi,updated_at:version(j)})).rejects.toMatchObject({status:422});
 await withSystem(db=>db.query('DELETE FROM time_off WHERE workspace_id=$1 AND user_id=$2',[ws,ids.ravi]));
 await withSystem(db=>db.query("UPDATE members SET trades=ARRAY['electrical'] WHERE workspace_id=$1 AND user_id=$2",[ws,ids.ravi]));ranked=await suggestWorkers(ids.nabil,ws,id);expect(ranked.preference_reason).toContain('does not cover');
 expect(await previousTechnician(ids.kevin,ws)).toMatchObject({user_id:ids.ravi});
});
it('rechecks a competing booking and a changed job before confirming the move',async()=>{
 const o=await job();const args={id:o.id,scheduled_for:localAt(11),updated_at:version(o)};
 const p:any=await prepareClientVisit(ids.pranav,ws,'reschedule_visit',args);
 await createWorkOrder(ids.imran,ws,{title:'Competing visit',site_id:siteId(1),assignee_id:ids.ravi,scheduled_for:localAt(11)});
 const r=await confirm(ids.pranav,p);expect(r.result.isError).toBe(true);expect(r.reply).toContain('no longer free');
 await withSystem(db=>db.query("UPDATE work_orders SET title='Changed tap' WHERE id=$1",[o.id]));
 await expect(prepareClientVisit(ids.pranav,ws,'reschedule_visit',args)).rejects.toMatchObject({status:409});
});
it('escalates if the technician leaves after the cancellation card was shown',async()=>{
 const o=await job();const p:any=await prepareClientVisit(ids.pranav,ws,'cancel_visit',{id:o.id,updated_at:version(o)});
 await patchWorkOrder(ids.ravi,ws,o.id,{on_way:true,updated_at:version(o)});
 const r=await confirm(ids.pranav,p);expect(r.reply).toBe('Ravi is already on the way. I asked the supervisor to call you.');expect((await getWorkOrder(ids.pranav,ws,o.id)).status).toBe('scheduled');
});
it('a request through the Agent saves a repeat preference without booking anyone',async()=>{
 const o=await job(ids.kevin);await withSystem(db=>db.query("UPDATE work_orders SET status='done' WHERE id=$1",[o.id]));
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{name:'create_request',args:{title:'Leaking tap',description:'The kitchen tap leaks again',site_id:siteId(1),same_technician:true},id:'request'}]} as any);
 const p:any=await assistant(ids.kevin,ws,{messages:[{role:'user',content:'The kitchen tap leaks again. Same technician as last time please.'}]});expect(p.pending_action.summary).toContain('same technician');
 const r=await confirm(ids.kevin,p);expect(r.result.structuredContent.result.preferred_technician_id).toBe(ids.ravi);expect(r.result.structuredContent.result.status).toBe('pending');
});

it('each seeded client persona has his own finished technician and scheduled visit',async()=>{
 for(const user of [ids.pranav,ids.kevin,ids.faisal]){
  expect(await previousTechnician(user,ws)).toMatchObject({user_id:ids.ravi});
  const visits=await withSystem(db=>db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND created_by=$2 AND status='scheduled'",[ws,user]));expect(visits.rows.length).toBeGreaterThan(0);
 }
});
it('does not reopen client cancellation when started work returns to scheduled',async()=>{
 const o=await job();let current=await patchWorkOrder(ids.ravi,ws,o.id,{status:'in_progress',updated_at:version(o)});current=await patchWorkOrder(ids.ravi,ws,o.id,{status:'scheduled',updated_at:version(current)});
 const r:any=await prepareClientVisit(ids.pranav,ws,'cancel_visit',{id:o.id,updated_at:version(current)});expect(r.pending_action).toBeUndefined();expect(r.reply).toContain('asked the supervisor to call you');
});
it('never uses another client history for a repeat preference',async()=>{
 await withSystem(db=>db.query("UPDATE work_orders SET created_by=$3 WHERE workspace_id=$1 AND created_by=$2 AND status='done'",[ws,ids.kevin,ids.pranav]));
 expect(await previousTechnician(ids.kevin,ws)).toBeNull();
 await expect(createSuggestion(ids.kevin,ws,{title:'Repair tap',site_id:siteId(1),problem:'The tap is dripping',same_technician:true})).rejects.toMatchObject({status:422});
});
