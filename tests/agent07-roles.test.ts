import { afterAll, afterEach, expect, it, vi } from 'vitest';
import { closePools, withSystem, withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
import { createWorkOrder } from '../lib/services/work-orders';
import { listDecisions } from '../lib/services/agent-log';
import { patchPreferences } from '../lib/services/settings';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
const ws=ids.ridgeline, made:string[]=[],actions:{user:string;id:string}[]=[],memories:{user:string;id:string}[]=[];
const actors=[ids.ravi,ids.nabil,ids.pranav,ids.kevin,ids.faisal];
afterEach(async()=>{
 for(const user of actors)await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[user]);
  const rows=await db.query("SELECT id FROM assistant_actions WHERE workspace_id=$1 AND (args->>'work_order_id'=ANY($2) OR args->>'id'=ANY($2))",[ws,made]);
  for(const r of rows.rows)await db.query('DELETE FROM assistant_actions WHERE id=$1',[r.id]);
  for(const a of actions.filter(a=>a.user===user))await db.query('DELETE FROM assistant_actions WHERE id=$1',[a.id]);
  for(const m of memories.filter(m=>m.user===user))await db.query('DELETE FROM personal_agent_learning WHERE id=$1',[m.id]);
 });
 await withSystem(async db=>{
  for(const id of made.splice(0)){
   for(const table of ['work_order_events','comments','notifications'])await db.query(`DELETE FROM ${table} WHERE ${table==='notifications'?'entity_id':'work_order_id'}=$1`,[id]);
   await db.query('DELETE FROM work_orders WHERE id=$1',[id]);
  }
 });actions.length=0;memories.length=0;vi.mocked(assistantTurn).mockReset();
});
afterAll(closePools);
async function job(title='Clinic drain line',owner?:string,assignee:string=ids.ravi){
 const client=owner===ids.faisal?ids.northgate:ids.harbor;
 const site=await withSystem(async db=>(await db.query('SELECT id FROM sites WHERE workspace_id=$1 AND client_id=$2 LIMIT 1',[ws,client])).rows[0]);
 const o:any=await createWorkOrder(ids.imran,ws,{title,client_id:client,site_id:site.id,assignee_id:assignee});made.push(o.id);
 if(owner)await withSystem(db=>db.query('UPDATE work_orders SET created_by=$2 WHERE id=$1',[o.id,owner]));
 return o;
}
function turn(name:string,args:unknown){vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{name,args,id:'a'}]} as any).mockResolvedValueOnce({calls:[],text:'Model claims it is saved.'} as any);}
const ask=(user:string,content:string)=>assistant(user,ws,{messages:[{role:'user',content}]}) as Promise<any>;
const notes=(id:string)=>withSystem(async db=>(await db.query('SELECT body,visibility FROM comments WHERE work_order_id=$1',[id])).rows);
it('technician saves his matching note with a server reply and What I did entry',async()=>{
 const o=await job();await patchPreferences(ids.ravi,{preferred_name:'Rav'});
 try{
  turn('add_comment',{work_order_id:o.id,body:'Cleaned the drain line',visibility:'client'});
  const r=await ask(ids.ravi,'log this work: cleaned the drain line at the clinic');
  expect(r.reply).toBe(`Done, Rav. I saved your note on WO ${o.order_number} ${o.title}. [Open job](/work-orders/${o.id})`);
  expect(r.logged).toBe(true);expect(await notes(o.id)).toEqual([{body:'Cleaned the drain line',visibility:'internal'}]);
  expect(await listDecisions(ids.ravi,ws)).toContainEqual(expect.objectContaining({tool:'add_comment',outcome:'done',summary:expect.stringContaining(`WO ${o.order_number}`)}));
 }finally{await patchPreferences(ids.ravi,{preferred_name:null});}
});
it('technician cannot note a job assigned to another man',async()=>{
 const o=await job('Clinic fan',undefined,ids.sam);turn('add_comment',{work_order_id:o.id,body:'Checked the fan'});
 const r=await ask(ids.ravi,`Save this on WO ${o.order_number}: checked the fan`);
 expect(r.reply).toContain('Nothing was saved');expect(await notes(o.id)).toEqual([]);expect(r.pending_action).toBeUndefined();
});
it('two matching jobs ask one short question through ask_choice without saving',async()=>{
 const a=await job(),b=await job('Clinic tap');turn('add_comment',{work_order_id:a.id,body:'Cleaned the drain'});
 const r=await ask(ids.ravi,'save this at the clinic');
 expect(r.reply).toBe('Which job do you mean?');expect(r.choices).toEqual([`WO ${a.order_number} ${a.title}`.slice(0,30),`WO ${b.order_number} ${b.title}`.slice(0,30)]);
 expect(await notes(a.id)).toEqual([]);expect(await notes(b.id)).toEqual([]);
});
it('no matching job asks for a choice and saves nothing',async()=>{
 const o=await job();turn('add_comment',{work_order_id:o.id,body:'Checked it'});
 const r=await ask(ids.ravi,'save this at the observatory');expect(r.choices.length).toBeGreaterThan(1);expect(await notes(o.id)).toEqual([]);
});
it('office staff saves a note on any workspace job',async()=>{
 const o=await job('Office fan',undefined,ids.sam);turn('add_comment',{work_order_id:o.id,body:'Call before coming'});
 const r=await ask(ids.nabil,`Note on WO ${o.order_number}: call before coming`);
 expect(r.reply).toContain(`Done, Nabil. I saved your note on WO ${o.order_number}`);expect(r.logged).toBe(true);expect((await notes(o.id))[0].visibility).toBe('internal');
});
it.each([[ids.pranav,'manager','Pranav'],[ids.kevin,'office','Kevin'],[ids.faisal,'household','Faisal']])('client %s as %s saves only his own request with company visibility',async(user,_kind,name)=>{
 const own=await job('Client drain',user),other=await job('Other drain',user===ids.faisal?ids.omar:ids.imran);
 turn('add_comment',{work_order_id:own.id,body:'Please call first',visibility:'internal'});
 const r=await ask(user,`Save this on WO ${own.order_number}: please call first`);
 expect(r.reply).toContain(`Done, ${name}. I saved your note on WO ${own.order_number}`);expect(r.logged).toBe(true);
 expect(await notes(own.id)).toEqual([{body:'Please call first',visibility:'client'}]);
 expect(await listDecisions(user,ws)).toContainEqual(expect.objectContaining({tool:'add_comment',outcome:'done'}));
 vi.mocked(assistantTurn).mockReset();turn('add_comment',{work_order_id:other.id,body:'Wrong request'});
 expect((await ask(user,`Save this on WO ${other.order_number}`)).reply).toContain('Nothing was saved');expect(await notes(other.id)).toEqual([]);
});
it.each(['set_job_payment','add_comment'])('technician cash payment gets an AGENT11 Ask offer even from %s and saves nothing',async(tool)=>{
 const o=await job();turn(tool,tool==='add_comment'?{work_order_id:o.id,body:'The client paid cash'}:{id:o.id,payment_status:'paid'});
 const before=await withSystem(async db=>(await db.query('SELECT payment_status FROM work_orders WHERE id=$1',[o.id])).rows[0]);
 const r=await ask(ids.ravi,`Note that the client paid cash on WO ${o.order_number}`);
 expect(r.offers).toHaveLength(1);expect(r.offers[0].label).toMatch(/^Ask /);expect(r.pending_action).toBeUndefined();expect(await notes(o.id)).toEqual([]);
 expect(await withSystem(async db=>(await db.query('SELECT payment_status FROM work_orders WHERE id=$1',[o.id])).rows[0])).toEqual(before);
});
it.each(actors)('memory uses remember_about_me for %s',async user=>{
 turn('remember_about_me',{note:'I start at 7'});const r=await ask(user,'put this in memory: I start at 7');
 expect(r.pending_action.tool).toBe('remember_about_me');actions.push({user,id:r.pending_action.id});
 const done:any=await assistant(user,ws,{messages:[],confirm_action_id:r.pending_action.id});expect(done.logged).toBe(true);
 const rows=await withUser(user,async db=>(await db.query("SELECT id FROM personal_agent_learning WHERE user_id=$1 AND workspace_id=$2 AND body='I start at 7'",[user,ws])).rows);
 expect(rows).toHaveLength(1);memories.push({user,id:rows[0].id});
});
it('technician job done keeps the save_job_report card',async()=>{
 const o=await job();turn('save_job_report',{id:o.id,outcome:'fixed',work:'Cleaned the drain line'});
 const r=await ask(ids.ravi,`Job done on WO ${o.order_number}`);expect(r.pending_action.tool).toBe('save_job_report');
 expect(await notes(o.id)).toEqual([]);
});

it.each([[ids.ravi,'Ravi'],[ids.kevin,'Kevin']])('notes in ask before every change keep the card and server reply for %s',async(user,name)=>{
 const o=await job('Clinic drain',user===ids.kevin?user:undefined);
 await withSystem(db=>db.query("UPDATE workspaces SET approval_mode='every' WHERE id=$1",[ws]));
 try{
  turn('add_comment',{work_order_id:o.id,body:'Call first'});
  const p=await ask(user,`Save this on WO ${o.order_number}: call first`);
  expect(p.pending_action.tool).toBe('add_comment');expect(await notes(o.id)).toEqual([]);
  const done:any=await assistant(user,ws,{messages:[],confirm_action_id:p.pending_action.id});
  expect(done.reply).toBe(`Done, ${name}. I saved your note on WO ${o.order_number} ${o.title}. [Open job](/work-orders/${o.id})`);
  expect(done.logged).toBe(true);
 }finally{await withSystem(db=>db.query("UPDATE workspaces SET approval_mode='important' WHERE id=$1",[ws]));}
});
it('a tap choice uses the latest WO number rather than an earlier one',async()=>{
 const a=await job(),b=await job('Clinic tap');turn('add_comment',{work_order_id:b.id,body:'Call first'});
 const r:any=await assistant(ids.ravi,ws,{messages:[{role:'user',content:`WO ${a.order_number}`},{role:'assistant',content:'Which job do you mean?'},{role:'user',content:`WO ${b.order_number}: call first`}]});
 expect(r.reply).toContain(`I saved your note on WO ${b.order_number}`);expect(await notes(a.id)).toEqual([]);
});
it('a technician note that only mentions paying a supplier stays a note, not a payment change',async()=>{
 const o=await job();turn('add_comment',{work_order_id:o.id,body:'Paid the supplier for the part'});
 const r=await ask(ids.ravi,`Note on WO ${o.order_number}: I paid the supplier for the part`);
 expect(r.offers).toBeUndefined();expect(r.reply).toContain(`WO ${o.order_number}`);expect((await notes(o.id)).map(n=>n.body)).toEqual(['Paid the supplier for the part']);
});
