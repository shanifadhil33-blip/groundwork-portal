// DEMO11 and DEMO12 (scope cut Oct 20): a judge login for every user type, and one labelled demo control, "Demo: make a job late".
// The urgent reshuffle control is gone with the cut; before and after learning waits for LEARN10 and LEARN14.
import { afterAll,beforeEach,expect,it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { closePools,ownerPool,withSystem } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { seed } from '../scripts/seed';
import { ids } from '../lib/fixture';
import { overdueSql } from '../lib/dates';
import { personas } from '../components/public/demo-picker';
import * as start from '../app/api/demo/start/route';
import * as late from '../app/api/demo/late/route';
import * as learning from '../app/api/demo/learning/route';
import { companyHistory } from '../lib/services/company-history';
beforeEach(async()=>{setAuthResolverForTests();const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterAll(async()=>{await closePools();});
const q=async(sql:string,args:unknown[])=>withSystem(async db=>(await db.query(sql,args)).rows);
async function post(handler:(req:Request)=>Promise<Response>,body?:unknown,cookie?:string){const r=await handler(new Request('http://localhost/api',{method:'POST',headers:cookie?{cookie}:{},body:body===undefined?undefined:JSON.stringify(body)}));return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')??''};}
it('the demo page has a judge login for every user type',()=>{
 expect(new Set(personas.map(p=>p.role))).toEqual(new Set(['Admin','Supervisor','Technician','Office staff','Facility manager','Facility staff','Household']));
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
it('the control is labelled as a demo control in the demo menu, for the office only',()=>{
 const shell=readFileSync('components/app/shell.tsx','utf8');
 expect(shell).toContain('{isOffice(member?.role)&&<Button variant="ghost" disabled={lateBusy} onClick={()=>void makeLate()}>Demo: make a job late</Button>}');
 expect(JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8'))['Demo: make a job late']).toBeTruthy();
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
 const shell=readFileSync('components/app/shell.tsx','utf8');expect(shell).toContain('{isOffice(member?.role)&&<Button variant="ghost" disabled={lateBusy} onClick={()=>void showLearning()}>Demo: before and after learning</Button>}');
 const card=readFileSync('components/app/company-history.tsx','utf8');expect(card).toContain('Before learning');expect(card).toContain('After learning');
});
it('the history card and the demo controls are written in all 21 languages, min in Arabic too',()=>{
 const keys=['From your company’s history','Usual time','Based on','finished jobs','temporary fixes','Same trade at this site, last six months','Not enough finished jobs yet to say how long this takes.','min','hr','Demo: before and after learning','Before learning','After learning','A new company with no finished jobs.','This company, from its own finished jobs.','No job has enough finished jobs behind it yet.','Demo: make a job late','Isolation check','Switch persona','Reset demo'];
 for(const f of readdirSync('public/i18n')){const d=JSON.parse(readFileSync(`public/i18n/${f}`,'utf8'));for(const k of keys){expect(d[k],`${f} ${k}`).toBeTruthy();expect(d[k]).not.toMatch(/[-\u2013\u2014]/);}}
 expect(JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8')).min).toBe('دقيقة');
});
