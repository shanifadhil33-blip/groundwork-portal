// DEMO11 and DEMO12 (scope cut Oct 20): a judge login for every user type, and one labelled demo control, "Demo: make a job late".
// The urgent reshuffle control is gone with the cut; before and after learning waits for LEARN10 and LEARN14.
import { afterAll,beforeEach,expect,it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { closePools,ownerPool,withSystem } from '../lib/db';
import { getSessionUserId,setAuthResolverForTests } from '../lib/auth';
import { sandboxToken } from '../lib/services/demo';
import { homeForPersona } from '../lib/ui/helpers';
import { seed } from '../scripts/seed';
import { ids } from '../lib/fixture';
import { overdueSql } from '../lib/dates';
import { personas } from '../components/public/demo-picker';
import * as start from '../app/api/demo/start/route';
import * as switchRoute from '../app/api/demo/switch/route';
import * as reset from '../app/api/demo/reset/route';
import * as late from '../app/api/demo/late/route';
import * as learning from '../app/api/demo/learning/route';
import { companyHistory } from '../lib/services/company-history';
beforeEach(async()=>{setAuthResolverForTests();const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterAll(async()=>{await closePools();});
const q=async(sql:string,args:unknown[])=>withSystem(async db=>(await db.query(sql,args)).rows);
async function post(handler:(req:Request)=>Promise<Response>,body?:unknown,cookie?:string){const r=await handler(new Request('http://localhost/api',{method:'POST',headers:cookie?{cookie}:{},body:body===undefined?undefined:JSON.stringify(body)}));return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')??''};}
it('the demo page has a judge login for every user type',()=>{
 expect(new Set(personas.map(p=>p.role))).toEqual(new Set(['Owner','Admin','Supervisor','Technician','Office staff','Client manager','Client staff','Home client']));
});
const judgeHomes={imran:'/dashboard',hassan:'/dashboard',sam:'/dashboard',ravi:'/today',nabil:'/dashboard',pranav:'/home',omar:'/home',kevin:'/home',faisal:'/home'};
const judgeRoles={Owner:{role:'admin',is_owner:true},Admin:{role:'admin',is_owner:false},Supervisor:{role:'staff',staff_kind:null},Technician:{role:'technician'},'Office staff':{role:'staff',staff_kind:'office'},'Client manager':{role:'client',client_kind:'manager'},'Client staff':{role:'client',client_kind:'office'},'Home client':{role:'client',client_kind:'household'}} as Record<string,Record<string,unknown>>;
for(const language of ['en-IN','ar-AE'])it(`every public login opens the right sandbox person and home in ${language}`,async()=>{
 let ws:string|undefined;
 for(const persona of personas){
  const r=await post(start.POST,{persona:persona.key,language},ws?`groundwork-sandbox=${sandboxToken(ws)}`:undefined);expect(r.status,persona.key).toBe(201);
  if(ws)expect(r.body.workspace_id).toBe(ws);else ws=r.body.workspace_id;
  const user=await getSessionUserId(new Request('http://localhost',{headers:{cookie:r.cookie}}));expect(user).toBeTruthy();
  const row=(await q('SELECT u.name,u.is_demo,u.demo_workspace_id,u.demo_persona,m.role,m.is_owner,m.staff_kind,m.client_kind,p.language FROM users u JOIN members m ON m.user_id=u.id JOIN user_preferences p ON p.user_id=u.id WHERE u.id=$1',[user]))[0];
  // Manager is the default client kind in the fixture (stored as NULL).
  expect({...row,client_kind:row.client_kind??'manager'}).toMatchObject({...judgeRoles[persona.role],name:persona.name,is_demo:true,demo_workspace_id:ws,demo_persona:persona.key,language});
  expect(homeForPersona(persona.key)).toBe(judgeHomes[persona.key]);
 }
 expect((await q('SELECT is_demo FROM workspaces WHERE id=$1',[ws]))[0].is_demo).toBe(true);
 // The new person is never added to a real workspace or given an external account.
 expect(await q("SELECT id FROM users WHERE demo_persona='hassan' AND NOT is_demo",[])).toEqual([]);
 expect(await q('SELECT a.id FROM accounts a JOIN users u ON u.id=a."userId" WHERE u.demo_workspace_id=$1',[ws])).toEqual([]);
});
it('switches to the separate admin and resets him with the viewer language, rotating the old session',async()=>{
 const first=await post(start.POST,{persona:'imran',language:'en-IN'});
 const switched=await post(switchRoute.POST,{persona:'hassan',language:'ar-AE'},first.cookie);expect(switched.status).toBe(200);expect(switched.body.workspace_id).toBe(first.body.workspace_id);
 expect(await getSessionUserId(new Request('http://localhost',{headers:{cookie:first.cookie}}))).toBeNull();
 const fresh=await post(reset.POST,{confirm:true},switched.cookie);expect(fresh.status).toBe(200);expect(fresh.body.persona).toBe('hassan');expect(fresh.body.workspace_id).not.toBe(first.body.workspace_id);
 const user=await getSessionUserId(new Request('http://localhost',{headers:{cookie:fresh.cookie}}));
 expect((await q('SELECT m.is_owner,p.language FROM members m JOIN user_preferences p ON p.user_id=m.user_id WHERE m.user_id=$1',[user]))[0]).toEqual({is_owner:false,language:'ar-AE'});
});
it('rejects unsupported viewer languages before creating a sandbox',async()=>{
 expect((await post(start.POST,{persona:'hassan',language:'invalid'})).status).toBe(422);
 expect(await q('SELECT id FROM workspaces WHERE is_demo',[])).toEqual([]);
});
it('an office person in a demo sandbox makes one job late, and only that due date moves',async()=>{
 const s=await post(start.POST,{persona:'imran'});expect(s.status).toBe(201);
 const ws=s.body.workspace_id;const before=(await q(`SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1 AND ${overdueSql}`,[ws]))[0].n;
 const r=await post(late.POST,undefined,s.cookie);expect(r.status).toBe(200);
 const row=(await q(`SELECT title,status,(${overdueSql}) AS late FROM work_orders WHERE id=$1 AND workspace_id=$2`,[r.body.work_order_id,ws]))[0];
 expect(row).toMatchObject({late:true,title:r.body.title});expect(['open','scheduled','in_progress']).toContain(row.status);
 expect((await q(`SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1 AND ${overdueSql}`,[ws]))[0].n).toBe(before+1);
});
it('a technician, a client and a real (non demo) account are refused',async()=>{
 for(const persona of ['ravi','pranav']){const s=await post(start.POST,{persona});expect((await post(late.POST,undefined,s.cookie)).status).toBe(403);}
 setAuthResolverForTests(async()=>ids.imran);
 expect((await post(late.POST)).status).toBe(404);
});
it('keeps practice controls out of the demo menu (cut list, section 4)',()=>{
 const shell=readFileSync('components/app/shell.tsx','utf8');
 for(const label of ['Demo: make a job late','Demo: before and after learning','Isolation check','Switch persona','Open the demo chat'])expect(shell).not.toContain(label);
});
it('Demo: before and after learning picks the open job with the most history, changes nothing, office only',async()=>{
 const s=await post(start.POST,{persona:'imran'});const ws=s.body.workspace_id;
 const snap=async()=>JSON.stringify(await q('SELECT id,status,due_on,updated_at FROM work_orders WHERE workspace_id=$1 ORDER BY id',[ws]));
 const before=await snap();const r=await post(learning.POST,undefined,s.cookie);expect(r.status).toBe(200);
 expect(r.body.before).toEqual({based_on:0,typical_minutes:null});
 expect(r.body.after.typical_minutes).toBeGreaterThan(0);expect(r.body.after.based_on).toBeGreaterThanOrEqual(3);
 const imran=(await q("SELECT user_id FROM members WHERE workspace_id=$1 AND role='admin' LIMIT 1",[ws]))[0].user_id;
 expect(await companyHistory(imran,ws,r.body.work_order_id)).toEqual(r.body.after);
 expect(await snap()).toBe(before);
 for(const persona of ['ravi','pranav']){const t=await post(start.POST,{persona});expect((await post(learning.POST,undefined,t.cookie)).status).toBe(403);}
 setAuthResolverForTests(async()=>ids.imran);expect((await post(learning.POST)).status).toBe(404);
 
 const card=readFileSync('components/app/company-history.tsx','utf8');expect(card).toContain('Before learning');expect(card).toContain('After learning');
});
it('the history card and the demo controls are written in all 21 languages, min in Arabic too',()=>{
 const keys=['From your company’s history','Usual time','Based on','finished jobs','temporary fixes','Same trade at this site, last six months','Not enough finished jobs yet to say how long this takes.','min','hr','Demo: before and after learning','Before learning','After learning','A new company with no finished jobs.','This company, from its own finished jobs.','No job has enough finished jobs behind it yet.','Demo: make a job late','Isolation check','Switch persona','Reset demo'];
 for(const f of readdirSync('public/i18n')){const d=JSON.parse(readFileSync(`public/i18n/${f}`,'utf8'));for(const k of keys){expect(d[k],`${f} ${k}`).toBeTruthy();expect(d[k]).not.toMatch(/[-\u2013\u2014]/);}}
 expect(JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8')).min).toBe('دقيقة');
});
