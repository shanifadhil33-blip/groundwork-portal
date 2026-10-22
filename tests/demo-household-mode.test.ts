import { afterAll, beforeAll, expect, it } from 'vitest';
import { closePools, withSystem, withUser } from '../lib/db';
import { startDemo, resetDemo } from '../lib/services/demo';
import { editHomeAddress } from '../lib/services/company-listing';
import { requestSites } from '../lib/services/clients';
import { teamToday } from '../lib/services/team';
import { me } from '../lib/services/workspaces';
import { ids } from '../lib/fixture';

let ws:string, second:string;
let people:Record<string,string>;
const sandboxes:string[]=[];
beforeAll(async()=>{
 for(let n=0;n<2;n++){
  const result=await startDemo({persona:'ravi'},`household-mode-${n}`);
  sandboxes.push(result.body.workspace_id);
 }
 [ws,second]=sandboxes;
 people=Object.fromEntries((await withSystem(db=>db.query('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1',[ws]))).rows.map(r=>[r.demo_persona,r.id]));
});
afterAll(async()=>{await withSystem(async db=>{for(const id of sandboxes)await db.query('SELECT delete_demo_workspace($1)',[id]);});await closePools();});
it('persists a household address for reopening and the next request site lookup',async()=>{
 const site=(await requestSites(people.faisal,ws))[0];
 const result=await editHomeAddress(people.faisal,ws,site.id,{address:'  Flat 8, Sample Court  '});
 expect(result.address).toBe('Flat 8, Sample Court');
 expect(await requestSites(people.faisal,ws)).toContainEqual(expect.objectContaining({id:site.id,address:'Flat 8, Sample Court'}));
 // SQL still refuses the demo identity. The service uses its checked, attributed owner path.
 await expect(withUser(people.faisal,db=>db.query('SELECT edit_household_address($1,$2,$3)',[ws,site.id,'Blocked']))).rejects.toMatchObject({code:'P0403'});
});
it('denies other tenants, sandboxes, roles, archived sites and invalid input',async()=>{
 const site=(await requestSites(people.faisal,ws))[0];
 const foreign=(await requestSites(people.pranav,ws))[0];
 await expect(editHomeAddress(people.faisal,ws,foreign.id,{address:'Foreign'})).rejects.toMatchObject({status:403});
 await expect(editHomeAddress(people.faisal,second,site.id,{address:'Foreign'})).rejects.toBeTruthy();
 for(const user of [people.ravi,people.nabil,people.imran,people.pranav])await expect(editHomeAddress(user,ws,site.id,{address:'Foreign'})).rejects.toMatchObject({status:403});
 for(const address of ['', ' ', 'a'.repeat(2001)])await expect(editHomeAddress(people.faisal,ws,site.id,{address})).rejects.toBeTruthy();
 await withSystem(db=>db.query('UPDATE sites SET archived_at=now() WHERE id=$1',[site.id]));
 await expect(editHomeAddress(people.faisal,ws,site.id,{address:'Archived'})).rejects.toMatchObject({status:403});
 await withSystem(db=>db.query('UPDATE sites SET archived_at=null WHERE id=$1',[site.id]));
});
it('seeds only Ravi a private household preview without changing memberships or work visibility',async()=>{
 const ravi=await me(people.ravi);
 expect(ravi.household_preview).toMatchObject({workspace_id:ws,simulated:true,address:'Flat 12, Sample Court'});
 expect(ravi.memberships).toHaveLength(1);
 expect(ravi.memberships[0].role).toBe('technician');
 await expect(requestSites(people.ravi,ws)).rejects.toMatchObject({status:403});
 for(const key of ['imran','nabil','faisal','pranav','kevin','omar','sam'])expect((await me(people[key])).household_preview).toBeNull();
 expect((await me(people.nabil)).memberships[0]).toMatchObject({role:'staff',staff_kind:'office'});
 expect((await me(ids.ravi)).household_preview).toBeNull();
});
it('anchors an eligible Ravi visit to the workspace day',async()=>{
 const visit=(await withSystem(db=>db.query(`SELECT w.id FROM work_orders w JOIN workspaces s ON s.id=w.workspace_id JOIN members m ON m.workspace_id=w.workspace_id AND m.user_id=w.assignee_id
 WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND w.status='scheduled'
 AND (w.scheduled_for AT TIME ZONE s.timezone)::date=(now() AT TIME ZONE s.timezone)::date
 AND NOT (extract(dow FROM now() AT TIME ZONE s.timezone)::smallint=ANY(m.off_days))
 AND NOT EXISTS(SELECT 1 FROM time_off t WHERE t.workspace_id=w.workspace_id AND t.user_id=w.assignee_id AND t.status='approved' AND (now() AT TIME ZONE s.timezone)::date BETWEEN t.starts_on AND t.ends_on)`,[ws,people.ravi]))).rows;
 expect(visit.length).toBeGreaterThan(0);
});
it('labels the fictional code contact without adding provider accounts or credentials',async()=>{
 const demo=(await teamToday(people.imran,ws)).find(p=>p.user_id===people.ravi);
 expect(demo).toMatchObject({contact_preview:true,signs_in_with:'code',phone:'+971000000000'});
 const real=(await teamToday(ids.imran,ids.ridgeline)).find(p=>p.user_id===ids.ravi);
 expect(real).toMatchObject({contact_preview:false,signs_in_with:'google',phone:null});
 expect((await withSystem(db=>db.query('SELECT 1 FROM accounts WHERE "userId"=$1',[people.ravi]))).rows).toEqual([]);
 expect((await withSystem(db=>db.query('SELECT 1 FROM login_links WHERE user_id=$1',[people.ravi]))).rows).toEqual([]);
});
it('refuses expired address writes and previews and restores fixtures on reset',async()=>{
 const site=(await requestSites(people.faisal,ws))[0];
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 second' WHERE id=$1",[ws]));
 await expect(editHomeAddress(people.faisal,ws,site.id,{address:'Expired'})).rejects.toBeTruthy();
 expect((await me(people.ravi)).household_preview).toBeNull();
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()+interval '1 hour' WHERE id=$1",[ws]));
 const reset=await resetDemo(people.ravi,{confirm:true});sandboxes.push(reset.body.workspace_id);
 const user=(await withSystem(db=>db.query("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='ravi'",[reset.body.workspace_id]))).rows[0].id;
 expect((await me(user)).household_preview).toMatchObject({address:'Flat 12, Sample Court',workspace_id:reset.body.workspace_id});
});
