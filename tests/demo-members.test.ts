import { afterAll, beforeEach, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../lib/fixture';
import { startDemo, resetDemo } from '../lib/services/demo';
import { listNotifications } from '../lib/services/notifications';
import { archiveMember, changeMember, listMembers, memberImpact, setClientKind, setMemberRoles, unarchiveMember } from '../lib/services/members';
import { teamToday } from '../lib/services/team';
import { getWorkOrder, listWorkOrders } from '../lib/services/work-orders';

let ws:string, people:Record<string,string>;
beforeEach(async()=>{
 const sandbox=await startDemo({persona:'imran'},'local-members-test');
 ws=sandbox.body.workspace_id;
 people=await withSystem(async db=>Object.fromEntries((await db.query('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1',[ws])).rows.map(p=>[p.demo_persona,p.id])));
});
afterAll(closePools);
it('seeds final persona roles without role-change notices on creation or reset, but reports a later change',async()=>{
 const checkSeed=async(workspace:string)=>{
  const members=await withSystem(async db=>(await db.query('SELECT m.*,u.demo_persona FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1',[workspace])).rows);
  expect(members.find(m=>m.demo_persona==='faisal')).toMatchObject({role:'client',client_kind:'household'});
  expect(members.find(m=>m.demo_persona==='kevin')).toMatchObject({role:'client',client_kind:'office'});
  expect(members.find(m=>m.demo_persona==='nabil')).toMatchObject({role:'staff',staff_kind:'office'});
  expect(await withSystem(async db=>(await db.query("SELECT id FROM notifications WHERE workspace_id=$1 AND kind='roles_changed'",[workspace])).rows)).toEqual([]);
 };
 await checkSeed(ws);
 await setClientKind(people.imran,ws,people.faisal,{kind:'manager'});
 const changed=(await listNotifications(people.faisal,ws,new URLSearchParams('pageSize=100'))).data.filter(n=>n.kind==='roles_changed');
 expect(changed).toHaveLength(1);expect(changed[0].message).toContain('Imran changed your roles');
 const reset=await resetDemo(people.imran,{confirm:true});
 await checkSeed(reset.body.workspace_id);
});
it('saves demo roles through the Team path and reloads the same role on Members and Team',async()=>{
 await setMemberRoles(people.imran,ws,people.sam,{roles:['staff','technician']});
 expect((await listMembers(people.imran,ws)).find(m=>m.user_id===people.sam)).toMatchObject({role:'staff',extra_roles:['technician']});
 expect((await teamToday(people.imran,ws)).find(m=>m.user_id===people.sam)).toMatchObject({role:'staff',extra_roles:['technician']});
 await expect(setMemberRoles(people.nabil,ws,people.sam,{roles:['admin']})).rejects.toMatchObject({status:403});
 await expect(setMemberRoles(people.imran,ws,ids.sam,{roles:['admin']})).rejects.toMatchObject({status:404});
 await expect(setMemberRoles(ids.imran,ws,people.sam,{roles:['admin']})).rejects.toMatchObject({status:404});
 const other=await startDemo({persona:'imran'},'local-members-other');
 const otherSam=await withSystem(async db=>(await db.query("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='sam'",[other.body.workspace_id])).rows[0].id);
 await expect(setMemberRoles(people.imran,ws,otherSam,{roles:['admin']})).rejects.toMatchObject({status:404});
 await expect(archiveMember(people.imran,ws,otherSam)).rejects.toMatchObject({status:404});
 expect((await listMembers(ids.imran,ids.ridgeline)).find(m=>m.user_id===ids.sam)?.role).toBe('staff');
});
it('archives demo workers while retaining finished jobs and names, then restores open jobs',async()=>{
 const before=await memberImpact(people.imran,ws,people.ravi);
 expect(before.jobs).toBeGreaterThan(0);expect(before.can_delete).toBe(false);
 const finished=()=>withSystem(async db=>(await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status IN ('done','cancelled') ORDER BY id",[ws,people.ravi])).rows);
 const history=await finished();
 await expect(archiveMember(people.nabil,ws,people.ravi)).rejects.toMatchObject({status:403});
 expect(await archiveMember(people.imran,ws,people.ravi)).toMatchObject({archived:true,unassigned:before.open_jobs});
 expect(await finished()).toEqual(history);
 expect((await listMembers(people.imran,ws)).find(m=>m.user_id===people.ravi)).toMatchObject({name:'Ravi',archived_at:expect.any(Date)});
 expect((await teamToday(people.imran,ws)).some(m=>m.user_id===people.ravi)).toBe(false);
 expect(await unarchiveMember(people.imran,ws,people.ravi)).toMatchObject({jobs_back:before.open_jobs});
 expect((await teamToday(people.imran,ws)).some(m=>m.user_id===people.ravi)).toBe(true);
});
it('keeps the last owner and admin, client separation, household isolation and identity guards',async()=>{
 await expect(setMemberRoles(people.imran,ws,people.imran,{roles:['technician']})).rejects.toMatchObject({code:'last_owner'});
 await expect(archiveMember(people.imran,ws,people.imran)).rejects.toMatchObject({status:422});
 await setMemberRoles(people.imran,ws,people.sam,{roles:['admin']});
 await expect(archiveMember(people.sam,ws,people.imran)).rejects.toMatchObject({code:'forbidden'});
 expect((await listMembers(people.imran,ws)).find(m=>m.user_id===people.imran)).toMatchObject({role:'admin',is_owner:true,archived_at:null});
 await expect(setMemberRoles(people.imran,ws,people.kevin,{roles:['staff']})).rejects.toMatchObject({status:422});
 await expect(changeMember(people.imran,ws,people.kevin,{role:'staff'})).rejects.toMatchObject({code:'P0403'});
 await setClientKind(people.imran,ws,people.kevin,{kind:'office'});
 await archiveMember(people.imran,ws,people.kevin);
 await unarchiveMember(people.imran,ws,people.kevin);
 expect((await listMembers(people.imran,ws)).find(m=>m.user_id===people.kevin)).toMatchObject({role:'client',client_kind:'office',archived_at:null});
 const jobs=await listWorkOrders(people.faisal,ws,new URLSearchParams());
 expect(jobs.data.every((j:any)=>j.created_by===people.faisal)).toBe(true);
 const foreign=await withSystem(async db=>(await db.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND created_by IS DISTINCT FROM $2 LIMIT 1',[ws,people.faisal])).rows[0].id);
 await expect(getWorkOrder(people.faisal,ws,foreign)).rejects.toMatchObject({status:404});
 await expect(setClientKind(people.nabil,ws,people.faisal,{kind:'manager'})).rejects.toMatchObject({status:403});
});
it('keeps real legacy role changes and the history refusal unchanged',async()=>{
 try{
  expect(await changeMember(ids.imran,ids.ridgeline,ids.sam,{role:'technician',client_id:null})).toMatchObject({role:'technician'});
  await expect(changeMember(ids.imran,ids.ridgeline,ids.ravi)).rejects.toMatchObject({code:'has_history'});
  await expect(changeMember(ids.nabil,ids.ridgeline,ids.ravi,{role:'staff'})).rejects.toMatchObject({status:403});
 }finally{await changeMember(ids.imran,ids.ridgeline,ids.sam,{role:'staff',client_id:null});}
});
