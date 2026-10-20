import { afterAll,afterEach,beforeEach,expect,it } from 'vitest';
import { closePools,ownerPool,withSystem } from '../lib/db';
import { getSessionUserId,setAuthResolverForTests } from '../lib/auth';
import { seed } from '../scripts/seed';
import { ownerOverview } from '../lib/services/owner-overview';
import { DUNE_HARBOUR_NAME,DUNE_STAFF,DUNE_TECHS,DUNE_CLIENTS,DUNE_PERSONAS } from '../lib/fixture-dune-harbour';
import * as start from '../app/api/demo/start/route';
import * as switchRoute from '../app/api/demo/switch/route';
import * as reset from '../app/api/demo/reset/route';
import type { RouteContext } from '../lib/api';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
const prior=process.env.DEMO_DUNE_HARBOUR;
beforeEach(async()=>{setAuthResolverForTests();delete process.env.DEMO_DUNE_HARBOUR;const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterEach(()=>{if(prior===undefined)delete process.env.DEMO_DUNE_HARBOUR;else process.env.DEMO_DUNE_HARBOUR=prior;});
afterAll(async()=>{await closePools();});
async function call(handler:Handler,body?:unknown,cookie?:string){
 const req=new Request('http://localhost/api',{method:'POST',headers:cookie?{cookie}:{},body:JSON.stringify(body)});
 const r=await handler(req,{params:Promise.resolve({})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')??''};
}
const q=async(sql:string,args:unknown[])=>withSystem(async db=>(await db.query(sql,args)).rows);
it('is hidden from judges: without DEMO_DUNE_HARBOUR the demo refuses it and Ridgeline is unchanged',async()=>{
 expect((await call(start.POST,{persona:'kamau',company:'dune_harbour'})).status).toBe(404);
 expect((await call(start.POST,{persona:'imran',company:'dune_harbour'})).status).toBe(404);
 expect((await q('SELECT count(*)::int n FROM workspaces WHERE name=$1',[DUNE_HARBOUR_NAME]))[0].n).toBe(0);
 const r=await call(start.POST,{persona:'imran'});expect(r.status).toBe(201);
 expect((await q('SELECT name FROM workspaces WHERE id=$1',[r.body.workspace_id]))[0].name).toBe('Ridgeline Facility Services');
 // Ridgeline personas stay a fixed list: the cast of the other company can not sign in there.
 expect((await call(start.POST,{persona:'dipendra'})).status).toBe(422);
});
it('builds the trimmed Dune Harbour cast (13 people) in a demo sandbox with no real logins and no sign in codes',async()=>{
 process.env.DEMO_DUNE_HARBOUR='1';
 const r=await call(start.POST,{persona:'joseph',company:'dune_harbour'});expect(r.status).toBe(201);
 const ws=r.body.workspace_id;expect(r.body.company).toBe('dune_harbour');
 const w=(await q('SELECT name,is_demo,currency,country,demo_expires_at FROM workspaces WHERE id=$1',[ws]))[0];
 expect(w).toMatchObject({name:DUNE_HARBOUR_NAME,is_demo:true,currency:'AED',country:'AE'});
 expect(new Date(w.demo_expires_at).getTime()-Date.now()).toBeLessThanOrEqual(6*3600000+60000);
 const members=await q("SELECT m.role,m.staff_kind,m.client_kind,m.is_owner,m.trades,m.off_days,u.name,u.email,u.is_demo,p.language FROM members m JOIN users u ON u.id=m.user_id LEFT JOIN user_preferences p ON p.user_id=u.id WHERE m.workspace_id=$1",[ws]);
 expect(members).toHaveLength(13);
 expect(members.filter(m=>m.role==='technician')).toHaveLength(6);
 expect(members.filter(m=>m.role==='staff')).toHaveLength(2);
 expect(members.filter(m=>m.role==='admin')).toHaveLength(1);
 expect(members.filter(m=>m.client_kind==='household')).toHaveLength(2);
 expect(members.find(m=>m.name==='Imran')).toMatchObject({role:'admin',is_owner:true,language:'ar-AE'});
 expect(members.find(m=>m.name==='Nabil')).toMatchObject({role:'staff',staff_kind:'office'});
 expect(members.find(m=>m.name==='Dipendra')).toMatchObject({language:'ne',trades:['plumbing'],off_days:[6]});
 expect(members.find(m=>m.name==='Murali')).toMatchObject({language:'ta',off_days:[2]});
 expect(members.every(m=>m.is_demo&&m.email.endsWith('@demo.groundwork.invalid'))).toBe(true);
 const cast=[...DUNE_STAFF,...DUNE_TECHS,...DUNE_CLIENTS.flatMap(c=>c.people)].map(p=>p.name).sort();
 expect(members.map(m=>m.name).sort()).toEqual(cast);
 // No Google accounts, no sign in links or codes for fictional people.
 expect((await q('SELECT count(*)::int n FROM accounts a JOIN users u ON u.id=a."userId" WHERE u.demo_workspace_id=$1',[ws]))[0].n).toBe(0);
 expect((await q('SELECT count(*)::int n FROM login_links WHERE workspace_id=$1',[ws]))[0].n).toBe(0);
 expect((await q('SELECT count(*)::int n FROM invites WHERE workspace_id=$1',[ws]))[0].n).toBe(0);
 expect((await q('SELECT count(*)::int n FROM clients WHERE workspace_id=$1',[ws]))[0].n).toBe(4);
 expect((await q('SELECT count(*)::int n FROM sites WHERE workspace_id=$1',[ws]))[0].n).toBe(4);
 const jobs=await q('SELECT title,status,report_outcome,quote_status FROM work_orders WHERE workspace_id=$1',[ws]);
 expect(jobs.length).toBeGreaterThanOrEqual(18);
 expect(jobs.filter(j=>/waiting room 2/.test(j.title)&&j.status==='done')).toHaveLength(3);
 expect(jobs.find(j=>j.title==='Floor 9 riser breaker keeps tripping')?.status).toBe('in_progress');
 const off=await q("SELECT u.name,t.kind,t.status FROM time_off t JOIN users u ON u.id=t.user_id WHERE t.workspace_id=$1 ORDER BY u.name",[ws]);
 expect(off).toEqual([{name:'Kamau',kind:'sick',status:'pending'}]);
 // DEMO10 and DEMO11: every person in the trimmed cast is a judge login.
 expect([...DUNE_PERSONAS].sort()).toEqual([...DUNE_STAFF,...DUNE_TECHS,...DUNE_CLIENTS.flatMap(c=>c.people)].map(p=>p.key).sort());
 expect((await q("SELECT sender_name FROM job_suggestions WHERE workspace_id=$1 AND status='pending'",[ws])).map(s=>s.sender_name)).toEqual(['Kevin']);
 // Company overview shows recorded money, never AED 0.00: five paid repairs plus the clinic contract payment, three supplier costs.
 const imran=(await q("SELECT u.id FROM members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND u.name='Imran'",[ws]))[0].id;
 expect(await ownerOverview(imran,ws)).toMatchObject({currency:'AED',money_in:'11150.00',money_out:'645.00'});
 for(const m of await q('SELECT note FROM workspace_money WHERE workspace_id=$1',[ws]))expect(m.note).not.toMatch(/[-\u2013\u2014]/);
 // Public copy: no dashes in names, titles or notes.
 for(const j of jobs)expect(j.title).not.toMatch(/[-\u2013\u2014]/);
});
it('switch stays inside Dune Harbour, reset rebuilds the same company, and the Ridgeline sandbox is never reused for it',async()=>{
 process.env.DEMO_DUNE_HARBOUR='1';
 const ridge=await call(start.POST,{persona:'imran'});
 const sandbox=ridge.cookie.split(/,\s*(?=groundwork-sandbox=)/).find(c=>c.startsWith('groundwork-sandbox='))?.split(';')[0];
 const r=await call(start.POST,{persona:'imran',company:'dune_harbour'},sandbox);expect(r.status).toBe(201);
 expect(r.body.workspace_id).not.toBe(ridge.body.workspace_id);
 const s=await call(switchRoute.POST,{persona:'dipendra'},r.cookie);expect(s.status).toBe(200);expect(s.body.workspace_id).toBe(r.body.workspace_id);
 expect((await call(switchRoute.POST,{persona:'sam'},s.cookie)).status).toBe(422);
 const user=await getSessionUserId(new Request('http://localhost',{headers:{cookie:s.cookie}}));
 expect((await q('SELECT name FROM users WHERE id=$1',[user]))[0].name).toBe('Dipendra');
 const again=await call(reset.POST,{confirm:true},s.cookie);expect(again.status).toBe(200);
 expect((await q('SELECT name FROM workspaces WHERE id=$1',[again.body.workspace_id]))[0].name).toBe(DUNE_HARBOUR_NAME);
 expect((await q('SELECT count(*)::int n FROM workspaces WHERE id=$1',[r.body.workspace_id]))[0].n).toBe(0);
 // Without the switch on, a leftover Dune Harbour sandbox can not be reset into a new one.
 delete process.env.DEMO_DUNE_HARBOUR;
 expect((await call(reset.POST,{confirm:true},again.cookie)).status).toBe(404);
});
