import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { setAuthResolverForTests } from '../lib/auth';
import { POST } from '../app/api/workspaces/[ws]/agent-questions/route';
import { createWorkOrder } from '../lib/services/work-orders';
import { listAgentQuestions } from '../lib/services/agent-questions';
import { listDecisions, REFUSAL_REASON } from '../lib/services/agent-log';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
const ws=ids.ridgeline,made:string[]=[],questions:string[]=[];
beforeEach(async()=>{await withSystem(db=>db.query('UPDATE members SET is_owner=true WHERE workspace_id=$1 AND user_id=$2',[ws,ids.imran]));});
afterEach(async()=>{
 await withSystem(async db=>{
  await db.query("UPDATE members SET role='staff',staff_kind=NULL WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]);
  await db.query('UPDATE members SET archived_at=NULL,is_owner=false WHERE workspace_id=$1 AND user_id=$2',[ws,ids.imran]);
  await db.query('DELETE FROM contact_nicknames WHERE owner_user_id=$1 AND target_user_id=$2',[ids.ravi,ids.sam]);
  for(const id of questions.splice(0))await db.query('DELETE FROM agent_questions WHERE id=$1',[id]);
  await db.query("DELETE FROM assistant_actions WHERE workspace_id=$1 AND outcome='refused'",[ws]);
  for(const id of made.splice(0)){
   for(const table of ['work_order_events','comments','notifications'])await db.query(`DELETE FROM ${table} WHERE ${table==='notifications'?'entity_id':'work_order_id'}=$1`,[id]);
   await db.query('DELETE FROM work_orders WHERE id=$1',[id]);
  }
 });setAuthResolverForTests();vi.mocked(assistantTurn).mockReset();
});
afterAll(closePools);
async function job(){
 const s=await withSystem(async db=>(await db.query('SELECT id,client_id FROM sites WHERE workspace_id=$1 AND client_id=$2 LIMIT 1',[ws,ids.harbor])).rows[0]);
 const o:any=await createWorkOrder(ids.imran,ws,{title:'Offer test job',client_id:s.client_id,site_id:s.id,assignee_id:ids.ravi});made.push(o.id);return o;
}
function turns(name:string,args:unknown){
 const call={name,args,id:'refused'};
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[call,call]} as any).mockResolvedValueOnce({calls:[],text:"I can't change that. I can ask Sam for you."} as any);
}
const ask=(user:string,content='Give this job to Nabil')=>assistant(user,ws,{messages:[{role:'user',content}]}) as Promise<any>;
it('AGENT11: technician gets one named supervisor offer per refused tool, with the job and log summary',async()=>{
 const o=await job();turns('assign_work_order',{id:o.id,assignee_id:ids.nabil,updated_at:new Date(o.updated_at).toISOString()});
 const r=await ask(ids.ravi);
 expect(r.pending_action).toBeUndefined();expect(r.reply).toContain("can't change");expect(r.offers).toHaveLength(1);
 const offer=r.offers[0];expect(offer).toMatchObject({to_name:'Sam',label:'Ask Sam',work_order_id:o.id});
 expect(offer.question).toContain('Ravi');expect(offer.question).toContain('Give this job to Nabil');expect(offer.question).toContain(`WO ${o.order_number}`);
 const log=(await listDecisions(ids.ravi,ws)).find((r:any)=>r.tool==='assign_work_order')!;
 expect(log).toMatchObject({outcome:'refused',reason:REFUSAL_REASON.technician});expect(log.summary).toBe(offer.proposed);expect(log.why).toContain('Offered to ask Sam.');
 const history=vi.mocked(assistantTurn).mock.calls[1][0];
 for(const result of history.filter(m=>m.role==='result'))expect((result as any).result.content[0].text).toMatch(/Say you can ask Sam for him; the app shows a button\.$/);
 setAuthResolverForTests(async()=>ids.ravi);
 const response=await POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({question:offer.question,proposed:offer.proposed,work_order_id:offer.work_order_id})}),{params:Promise.resolve({ws})});
 expect(response.status).toBe(200);const sent=await response.json();questions.push(sent.id);
 expect((await listAgentQuestions(ids.sam,ws)).data).toContainEqual(expect.objectContaining({id:sent.id,question:offer.question,proposed:offer.proposed,work_order_id:o.id}));
 for(const text of [offer.label,offer.question,offer.proposed])expect(text).not.toMatch(/[–—]|\p{L}-\p{L}/u);
});
it('office staff get the owner admin for an admin change, never themselves',async()=>{
 await withSystem(db=>db.query("UPDATE members SET staff_kind='office' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 turns('set_approval_mode',{approval_mode:'every'});const r=await ask(ids.sam,'Ask before every change');
 expect(r.offers).toHaveLength(1);expect(r.offers[0].to_name).toBe('Imran');expect(r.offers[0].to_name).not.toBe('Sam');expect(r.offers[0].work_order_id).toBeUndefined();
});
it('clients receive no offer',async()=>{
 turns('set_approval_mode',{approval_mode:'every'});const r=await ask(ids.omar,'Ask before every change');expect(r.offers).toBeUndefined();expect(r.pending_action).toBeUndefined();
});
it('uses the visible saved name for the supervisor',async()=>{
 // contact_nicknames forces row level security even for the owner connection: write it as Ravi.
 await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.ravi]);await db.query("INSERT INTO contact_nicknames(owner_user_id,workspace_id,target_user_id,nickname) VALUES($1,$2,$3,'Samuel')",[ids.ravi,ws,ids.sam]);});
 const o=await job();turns('set_priority',{id:o.id,priority:'urgent',updated_at:new Date(o.updated_at).toISOString()});
 try { expect((await ask(ids.ravi)).offers[0].to_name).toBe('Samuel'); }
 finally { await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.ravi]);await db.query('DELETE FROM contact_nicknames WHERE owner_user_id=$1 AND workspace_id=$2',[ids.ravi,ws]);}); }
});
it('falls back to the owner when there is no supervisor, and makes no offer if neither is active',async()=>{
 const o=await job();await withSystem(db=>db.query("UPDATE members SET staff_kind='office' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 const args={id:o.id,priority:'urgent',updated_at:new Date(o.updated_at).toISOString()};turns('set_priority',args);expect((await ask(ids.ravi)).offers[0].to_name).toBe('Imran');
 await withSystem(db=>db.query('UPDATE members SET archived_at=now() WHERE workspace_id=$1 AND user_id=$2',[ws,ids.imran]));
 turns('set_priority',args);expect((await ask(ids.ravi)).offers).toBeUndefined();
});

it('uses the first active admin if there is no owner, including for technician admin refusals',async()=>{
 const o=await job();
 await withSystem(async db=>{
  await db.query('UPDATE members SET archived_at=now() WHERE workspace_id=$1 AND user_id=$2',[ws,ids.imran]);
  await db.query("UPDATE members SET role='admin' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]);
 });
 turns('set_job_payment',{id:o.id,payment_status:'paid'});
 expect((await ask(ids.ravi,'Mark this job paid')).offers[0].to_name).toBe('Sam');
});
it('record refusals use the owner admin and a plain proposed record change',async()=>{
 turns('create_client',{name:'Offer test client'});
 const r=await ask(ids.sam,'Add Offer test client');expect(r.offers[0]).toMatchObject({to_name:'Imran',proposed:'Add client “Offer test client”'});
 expect(r.offers[0].work_order_id).toBeUndefined();
});
it('admins get their normal card with no refusal offer',async()=>{
 turns('set_approval_mode',{approval_mode:'every'});
 const r=await ask(ids.imran,'Ask before every change');expect(r.pending_action).toBeTruthy();expect(r.offers).toBeUndefined();
 await withSystem(db=>db.query('DELETE FROM assistant_actions WHERE id=$1',[r.pending_action.id]));
});
it('AGENT11: a technician and a supervisor are offered the changes they may not make, so the refusal and the offer can happen; a client is not',async()=>{
 const names=async(user:string)=>{vi.mocked(assistantTurn).mockReset();vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[],text:'Okay.'} as any);await ask(user,'Hello');const [,decl,prompt]=vi.mocked(assistantTurn).mock.calls[0] as any;return {tools:(decl as {name:string}[]).map(d=>d.name),prompt:String(prompt)};};
 const tech=await names(ids.ravi);
 for(const t of ['assign_work_order','set_priority','set_job_payment','decide_time_off'])expect(tech.tools).toContain(t);
 expect(tech.prompt).toContain('call the tool for that change');
 const sup=await names(ids.sam);for(const t of ['set_job_payment','create_client'])expect(sup.tools).toContain(t);
 const client=await withSystem(async db=>(await db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND role='client' AND archived_at IS NULL LIMIT 1",[ws])).rows[0]?.user_id);
 if(client){const c=await names(client);for(const t of ['assign_work_order','set_priority','set_job_payment','create_client'])expect(c.tools).not.toContain(t);}
});
it('AGENT11: when the model refuses in its own words without a tool call, a technician still gets an offer with his own words; a lookup miss or a client gets none',async()=>{
 const text=(t:string)=>{vi.mocked(assistantTurn).mockReset();vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[],text:t} as any);};
 text("I'm not able to change a work order's priority. A supervisor can do it.");
 const r=await ask(ids.ravi,'Change the priority of WO 1 to urgent');
 expect(r.offers?.[0]).toMatchObject({to_name:'Sam',label:'Ask Sam'});
 expect(r.offers[0].question).toContain('Change the priority of WO 1 to urgent');expect(r.offers[0].question).not.toMatch(/[-\u2013\u2014]/);
 text("I can't find WO 999. Check the number.");expect((await ask(ids.ravi,'Open WO 999')).offers).toBeUndefined();
 const client=await withSystem(async db=>(await db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND role='client' AND archived_at IS NULL LIMIT 1",[ws])).rows[0]?.user_id);
 if(client){text('Only an admin can change that.');expect((await ask(client,'Change the price')).offers).toBeUndefined();}
});
it('AGENT11: after a refusal, an ask_supervisor call in the same turn makes no second card, only the one Ask button',async()=>{
 const o=await job();vi.mocked(assistantTurn).mockReset();
 vi.mocked(assistantTurn)
  .mockResolvedValueOnce({calls:[{name:'set_priority',args:{id:o.id,priority:'urgent',updated_at:new Date(o.updated_at).toISOString()},id:'a'}]} as any)
  .mockResolvedValueOnce({calls:[{name:'ask_supervisor',args:{question:'Can you change the priority to urgent?',proposed:'Yes',work_order_id:o.id},id:'b'}]} as any)
  .mockResolvedValueOnce({calls:[],text:'I can ask Sam for you.'} as any);
 const r=await ask(ids.ravi,'Change the priority to urgent');
 expect(r.pending_action).toBeUndefined();expect(r.offers).toHaveLength(1);expect(r.offers[0].label).toBe('Ask Sam');
 // assistant_actions may force row level security: count as Ravi, who would own the card.
 const cards=await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.ravi]);return (await db.query("SELECT count(*)::int n FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='ask_supervisor' AND consumed_at IS NULL",[ws,ids.ravi])).rows[0].n;});
 expect(cards).toBe(0);
});
