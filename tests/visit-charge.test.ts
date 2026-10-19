import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/ai', async original => ({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
vi.mock('../lib/services/push',()=>({sendPush:vi.fn(async()=>0)}));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { householdIntake } from '../lib/services/household';
import { patchWorkspace } from '../lib/services/workspaces';
import { inWorkspace } from '../lib/services/shared';
import { visitChargeFor } from '../lib/services/visit-charge';
import { callTool } from '../lib/agent/tools';
import { closePools, withSystem } from '../lib/db';
import { ids, siteId } from '../lib/fixture';
const ws=ids.ridgeline,user=ids.faisal;
let prior:any,member:any,site:any;
let actions:string[]=[],suggestions:string[]=[],audits:string[]=[];
const send=(content:string)=>assistant(user,ws,{messages:[{role:'user',content}]}) as Promise<any>;
beforeEach(async()=>{
 vi.mocked(assistantTurn).mockReset();
 vi.mocked(assistantTurn).mockResolvedValue({text:'Your request is open.',calls:[]} as any);
 await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[user]);
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  audits=(await db.query('SELECT id FROM audit_log WHERE workspace_id=$1',[ws])).rows.map(r=>r.id);
  await db.query("SELECT set_config('app.user_id',$1,true)",[user]);
  prior=(await db.query('SELECT visit_charge,visit_charge_regions,visit_charge_sample FROM workspaces WHERE id=$1',[ws])).rows[0];
  member=(await db.query('SELECT role,staff_kind,is_owner FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,ids.sam])).rows[0];
  site=(await db.query('SELECT region FROM sites WHERE id=$1',[siteId(4)])).rows[0];
  actions=(await db.query('SELECT id FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2',[ws,user])).rows.map(r=>r.id);
  suggestions=(await db.query('SELECT id FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2',[ws,user])).rows.map(r=>r.id);
  await db.query("UPDATE workspaces SET visit_charge=150,visit_charge_regions='{\"Sharjah\":200}',visit_charge_sample=true WHERE id=$1",[ws]);
 });
});
afterEach(async()=>{
 await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[user]);
  await db.query('DELETE FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key IN (SELECT id::text FROM assistant_actions WHERE workspace_id=$3 AND user_id=$1 AND NOT(id=ANY($4::uuid[])))',[user,ws+'/suggestions',ws,actions]);
  await db.query('DELETE FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND NOT(id=ANY($3::uuid[]))',[ws,user,actions]);
  await db.query('DELETE FROM notifications WHERE entity_id IN (SELECT id FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 AND NOT(id=ANY($3::uuid[])))',[ws,user,suggestions]);
  await db.query('DELETE FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 AND NOT(id=ANY($3::uuid[]))',[ws,user,suggestions]);
  await db.query('UPDATE workspaces SET visit_charge=$2,visit_charge_regions=$3,visit_charge_sample=$4 WHERE id=$1',[ws,prior.visit_charge,JSON.stringify(prior.visit_charge_regions),prior.visit_charge_sample]);
  await db.query('UPDATE members SET role=$3,staff_kind=$4,is_owner=$5 WHERE workspace_id=$1 AND user_id=$2',[ws,ids.sam,member.role,member.staff_kind,member.is_owner]);
  await db.query('UPDATE sites SET region=$2 WHERE id=$1',[siteId(4),site.region]);
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  await db.query('DELETE FROM audit_log WHERE workspace_id=$1 AND NOT(id=ANY($2::uuid[]))',[ws,audits]);
 });
});
afterAll(closePools);
it('owner and plain admin can set prices, including zero',async()=>{
 await expect(patchWorkspace(ids.imran,ws,{visit_charge:0})).resolves.toMatchObject({visit_charge:'0.00'});
 await withSystem(db=>db.query("UPDATE members SET role='admin',is_owner=false WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 await expect(patchWorkspace(ids.sam,ws,{visit_charge:175,visit_charge_regions:{Sharjah:225},visit_charge_sample:false})).resolves.toMatchObject({visit_charge:'175.00',visit_charge_regions:{Sharjah:225},visit_charge_sample:false});
});
it.each([ids.sam,ids.ravi,ids.nabil,ids.faisal])('refuses other members before a write: %s',async actor=>{
 await expect(patchWorkspace(actor,ws,{visit_charge:99})).rejects.toMatchObject({status:403,message:'Only the owner or an admin can set the visit charge.'});
 expect(await inWorkspace(user,ws,c=>visitChargeFor(c,null))).toMatchObject({amount:150});
});
it('validates amounts and region count and names',async()=>{
 for(const body of [{visit_charge:-1},{visit_charge:100001},{visit_charge_regions:{'':10}},{visit_charge_regions:{['x'.repeat(61)]:10}},{visit_charge_regions:{Dubai:-1}},{visit_charge_regions:{Dubai:100001}},{visit_charge_regions:Object.fromEntries(Array.from({length:31},(_,i)=>[String(i),1]))}])await expect(patchWorkspace(ids.imran,ws,body)).rejects.toThrow();
});
it('region override wins, zero is a price, and other regions use the default',async()=>{
 await withSystem(db=>db.query("UPDATE sites SET region='Sharjah' WHERE id=$1",[siteId(4)]));
 expect(await inWorkspace(user,ws,c=>visitChargeFor(c,siteId(4)))).toEqual({amount:200,currency:'AED',sample:true});
 await patchWorkspace(ids.imran,ws,{visit_charge_regions:{Sharjah:0}});
 expect(await inWorkspace(user,ws,c=>visitChargeFor(c,siteId(4)))).toMatchObject({amount:0});
 await withSystem(db=>db.query("UPDATE sites SET region='Dubai' WHERE id=$1",[siteId(4)]));
 expect(await inWorkspace(user,ws,c=>visitChargeFor(c,siteId(4)))).toMatchObject({amount:150});
});
it.each(['How much will it cost to fix my water heater?','What is the price?','visit charge','Is there a fee?','كم سعر إصلاح السخان؟','എത്ര ചാർജ് വരും?'])('fixed price answer without AI or intake: %s',async words=>{
 expect((await send(words)).reply).toBe('The visit charge is **AED 150.00**.\n\nThe full price depends on what the technician finds. He will tell you before any extra work.');
 expect(assistantTurn).not.toHaveBeenCalled();
 const idsNow=await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[user]);return (await db.query('SELECT id FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2',[ws,user])).rows.map(r=>r.id);});
 expect(idsNow).toEqual(actions);
});
it('no charge returns null and never guesses',async()=>{
 await patchWorkspace(ids.imran,ws,{visit_charge:null,visit_charge_regions:{}});
 expect(await inWorkspace(user,ws,c=>visitChargeFor(c,siteId(4)))).toMatchObject({amount:null});
 expect((await send('How much?')).reply).toBe("The office will confirm the price. I won't guess it.");
 expect(assistantTurn).not.toHaveBeenCalled();
});
async function card(){
 const first=await send('my AC is not cooling');
 const home=first.choices[0];await send(home);await send('Kitchen');await send('Today');return send('Skip photo');
}
it('card carries the sample price and confirmation saves the amount seen even after settings change',async()=>{
 const r=await card();const charge=r.pending_action.fields.visit_charge;
 expect(charge).toMatchObject({amount:expect.any(Number),currency:'AED',sample:true});
 await patchWorkspace(ids.imran,ws,{visit_charge:999,visit_charge_regions:{}});
 await assistant(user,ws,{messages:[],confirm_action_id:r.pending_action.id});
 const saved=await withSystem(async db=>(await db.query('SELECT visit_charge_shown FROM job_suggestions WHERE workspace_id=$1 AND sender_user_id=$2 AND NOT(id=ANY($3::uuid[]))',[ws,user,suggestions])).rows);
 expect(saved).toEqual([{visit_charge_shown:charge.amount.toFixed(2)}]);
});
it('a card with no price has null',async()=>{
 await patchWorkspace(ids.imran,ws,{visit_charge:null,visit_charge_regions:{}});
 expect((await card()).pending_action.fields.visit_charge.amount).toBeNull();
});
it('price questions preserve the open draft exactly and intake can continue',async()=>{
 const first=await send('my AC is not cooling');await send(first.choices[0]);
 const draft=()=>withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[user]);return (await db.query("SELECT id,args,declined_at FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='household_intake' AND declined_at IS NULL",[ws,user])).rows;});
 const before=await draft();expect(before).toHaveLength(1);
 expect((await send('How much will it cost?')).reply).toContain('The visit charge is');expect(await draft()).toEqual(before);
 expect((await send('Kitchen')).reply).toContain('Since when');expect(assistantTurn).not.toHaveBeenCalled();
});
it('emergency and status questions bypass the price reply',async()=>{
 // Exercise the same guard directly without writing emergency alerts or sending push messages.
 expect(await householdIntake(user,ws,[{role:'user',content:'How much for a gas leak?'}])).toBeNull();
 expect((await send('What is the status of my price quote?')).reply).toBe('Your request is open.');
 expect(assistantTurn).toHaveBeenCalledOnce();
});
it.each([ids.faisal,ids.pranav,ids.imran])('read tool through callTool for household manager and admin: %s',async actor=>{
 const site=await inWorkspace(actor,ws,async c=>(await c.db.query('SELECT id FROM sites WHERE workspace_id=$1 AND archived_at IS NULL ORDER BY id LIMIT 1',[ws])).rows[0]);
 const expected=await inWorkspace(actor,ws,c=>visitChargeFor(c,site.id));
 expect(await callTool({user:actor,ws,scope:'read',kind:'assistant'},'visit_charge',{site_id:site.id})).toMatchObject({structuredContent:{result:expected}});
});
