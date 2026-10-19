import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Client } from 'pg';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { patchWorkspace, deleteWorkspace, createWorkspace } from '../lib/services/workspaces';
import { setMemberRoles, changeMember, archiveMember } from '../lib/services/members';
import { setJobPayment } from '../lib/services/payments';
import { getSettings } from '../lib/services/settings';
import { callTool } from '../lib/agent/tools';
import { OWNER_REFUSAL } from '../lib/services/owner';
import { assistant } from '../lib/services/assistant';
import { assistantTurn } from '../lib/ai';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
const ws=ids.ridgeline;
let previous:any, members:any[],job:any,auditIds:string[],hadPreferences:boolean;
const actions:string[]=[];
beforeEach(async()=>{
 hadPreferences=await withSystem(async db=>(await db.query('SELECT 1 FROM user_preferences WHERE user_id=$1',[ids.sam])).rowCount!==0,ids.sam);
 await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  auditIds=(await db.query('SELECT id FROM audit_log WHERE workspace_id=$1',[ws])).rows.map(r=>r.id);
  previous=(await db.query('SELECT approval_mode,owner_handover FROM workspaces WHERE id=$1',[ws])).rows[0];
  members=(await db.query('SELECT user_id,role,is_owner,extra_roles,staff_kind,size_added_roles FROM members WHERE workspace_id=$1 AND user_id=ANY($2::uuid[])',[ws,[ids.imran,ids.sam,ids.nabil]])).rows;
  job=(await db.query("SELECT id,payment_status FROM work_orders WHERE workspace_id=$1 AND status='done' ORDER BY order_number LIMIT 1",[ws])).rows[0];
  await db.query("UPDATE workspaces SET approval_mode='important',owner_handover='{}' WHERE id=$1",[ws]);
  await db.query("UPDATE members SET role='admin',staff_kind=NULL WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]);
 });
});
afterEach(async()=>{
 await withSystem(async db=>{
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);
  await db.query('UPDATE workspaces SET approval_mode=$2,owner_handover=$3 WHERE id=$1',[ws,previous.approval_mode,previous.owner_handover]);
  for(const m of members)await db.query('UPDATE members SET role=$3,is_owner=$4,extra_roles=$5,staff_kind=$6,size_added_roles=$7 WHERE workspace_id=$1 AND user_id=$2',[ws,m.user_id,m.role,m.is_owner,m.extra_roles,m.staff_kind,m.size_added_roles]);
  await db.query('UPDATE work_orders SET payment_status=$2 WHERE id=$1',[job.id,job.payment_status]);
  await db.query('DELETE FROM audit_log WHERE workspace_id=$1 AND NOT(id=ANY($2::uuid[]))',[ws,auditIds]);
  await db.query("SELECT set_config('app.user_id',$1,true)",[ids.sam]);
  for(const id of actions.splice(0))expect((await db.query('DELETE FROM assistant_actions WHERE id=$1',[id])).rowCount).toBe(1);
  if(!hadPreferences)await db.query('DELETE FROM user_preferences WHERE user_id=$1',[ids.sam]);
 });vi.mocked(assistantTurn).mockReset();
});
afterAll(closePools);
const denied=(p:Promise<unknown>,message:string)=>expect(p).rejects.toMatchObject({status:403,message});
it('only the owner changes approval mode or hands it to admins, and can take it back',async()=>{
 await patchWorkspace(ids.imran,ws,{approval_mode:'every'});
 await denied(patchWorkspace(ids.sam,ws,{approval_mode:'important'}),OWNER_REFUSAL.approval_mode);
 await denied(patchWorkspace(ids.sam,ws,{owner_handover:['approval_mode']}),OWNER_REFUSAL.handover);
 await expect(patchWorkspace(ids.imran,ws,{owner_handover:['close']})).rejects.toThrow();
 await patchWorkspace(ids.imran,ws,{owner_handover:['approval_mode']});
 expect((await getSettings(ids.sam,ws)).owner_handover).toEqual(['approval_mode']);
 expect((await patchWorkspace(ids.sam,ws,{approval_mode:'important'})).approval_mode).toBe('important');
 await patchWorkspace(ids.imran,ws,{owner_handover:[]});
 await denied(patchWorkspace(ids.sam,ws,{approval_mode:'every'}),OWNER_REFUSAL.approval_mode);
});
it('a plain admin saving other settings with the current approval mode sent back is not refused',async()=>{
 await patchWorkspace(ids.imran,ws,{approval_mode:'every'});
 await expect(patchWorkspace(ids.sam,ws,{approval_mode:'every',role_names:{}})).resolves.toMatchObject({approval_mode:'every'});
 await expect(patchWorkspace(ids.sam,ws,{owner_handover:[]})).resolves.toBeTruthy();
 await denied(patchWorkspace(ids.sam,ws,{approval_mode:'important',role_names:{}}),OWNER_REFUSAL.approval_mode);
});
it('only the owner marks paid until handed over; other payment choices keep the current admin rule',async()=>{
 expect((await setJobPayment(ids.imran,ws,job.id,{payment_status:'paid'})).payment_status).toBe('paid');
 await denied(setJobPayment(ids.sam,ws,job.id,{payment_status:'paid'}),OWNER_REFUSAL.payments);
 for(const payment_status of ['to_bill','contract'])expect((await setJobPayment(ids.sam,ws,job.id,{payment_status})).payment_status).toBe(payment_status);
 await patchWorkspace(ids.imran,ws,{owner_handover:['payments']});
 expect((await setJobPayment(ids.sam,ws,job.id,{payment_status:'paid'})).payment_status).toBe('paid');
 // Supervisors could not change payments before ROLE07 and still cannot.
 await withSystem(db=>db.query("UPDATE members SET role='staff' WHERE workspace_id=$1 AND user_id=$2",[ws,ids.sam]));
 for(const payment_status of ['to_bill','contract','paid'])await expect(setJobPayment(ids.sam,ws,job.id,{payment_status})).rejects.toMatchObject({status:403});
});
it('only the owner chooses owners, including demotion, removal and archive paths; keeps the last owner',async()=>{
 await denied(setMemberRoles(ids.sam,ws,ids.nabil,{roles:['owner']}),OWNER_REFUSAL.owners);
 await denied(changeMember(ids.sam,ws,ids.imran,{role:'staff'}),OWNER_REFUSAL.owners);
 await denied(changeMember(ids.sam,ws,ids.imran),OWNER_REFUSAL.owners);
 await denied(archiveMember(ids.sam,ws,ids.imran),OWNER_REFUSAL.owners);
 await expect(setMemberRoles(ids.imran,ws,ids.imran,{roles:['admin']})).rejects.toMatchObject({code:'last_owner'});
 expect((await setMemberRoles(ids.imran,ws,ids.nabil,{roles:['owner']})).is_owner).toBe(true);
 await denied(setMemberRoles(ids.sam,ws,ids.nabil,{roles:['admin']}),OWNER_REFUSAL.owners);
 expect((await setMemberRoles(ids.imran,ws,ids.nabil,{roles:['admin']})).is_owner).toBe(false);
});
it('refuses account closing before any delete and lets the owner close his new company',async()=>{
 const query=vi.spyOn(Client.prototype,'query');
 try{
  await denied(deleteWorkspace(ids.sam,ws,{confirm_name:'Ridgeline Facility Services'}),OWNER_REFUSAL.close);
  expect(query.mock.calls.some(([q])=>/delete_workspace|^DELETE\b/i.test(String(q)))).toBe(false);
 }finally{query.mockRestore();}
 const company=await createWorkspace(ids.imran,{name:'Owner powers test company'});
 try{expect(await deleteWorkspace(ids.imran,company.id,{confirm_name:company.name})).toEqual({deleted:true});}
 finally{await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.imran]);await db.query('DELETE FROM workspaces WHERE id=$1',[company.id]);await db.query('DELETE FROM audit_log WHERE workspace_id=$1',[company.id]);});}
});
it.each(['assistant','agent'] as const)('%s tools refuse plain admins before any queue or write',async kind=>{
 await patchWorkspace(ids.imran,ws,{approval_mode:'every'});
 for(const [name,args,power] of [
  ['set_approval_mode',{approval_mode:'important'},'approval_mode'],
  ['set_job_payment',{id:job.id,payment_status:'paid'},'payments'],
  ['set_member_roles',{user_id:ids.nabil,roles:['owner']},'owners'],
  ['set_member_roles',{user_id:ids.imran,roles:['admin']},'owners'],
 ] as const){
  const query=vi.spyOn(Client.prototype,'query');
  try{
   const result=await callTool({user:ids.sam,ws,scope:'write',kind},name,args);
   expect(result).toMatchObject({isError:true,structuredContent:{error:{code:'forbidden',message:OWNER_REFUSAL[power]}}});
   expect(query.mock.calls.every(([q])=>/^(SELECT|BEGIN|COMMIT|ROLLBACK)\b/i.test(String(q)))).toBe(true);
  }finally{query.mockRestore();}
 }
});
it.each(['set_approval_mode','set_job_payment','set_member_roles'])('AGENT11 offers the owner to a refused admin for %s',async name=>{
 const args=name==='set_approval_mode'?{approval_mode:'every'}:name==='set_job_payment'?{id:job.id,payment_status:'paid'}:{user_id:ids.nabil,roles:['owner']};
 vi.mocked(assistantTurn).mockResolvedValueOnce({calls:[{id:'owner',name,args}]} as any).mockResolvedValueOnce({calls:[],text:'Imran can help.'} as any);
 const result:any=await assistant(ids.sam,ws,{messages:[{role:'user',content:'Please make this change'}]});
 expect(result.pending_action).toBeUndefined();expect(result.offers?.[0]).toMatchObject({to_name:'Imran',label:'Ask Imran'});
 const rows=await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[ids.sam]);return (await db.query("SELECT id FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND outcome='refused'",[ws,ids.sam])).rows;});actions.push(...rows.map(r=>r.id));
});
