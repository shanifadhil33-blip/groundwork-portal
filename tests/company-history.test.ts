// LEARN10 and LEARN14: learning from each company's own history, measured before and after. No simulation: the numbers are
// asserted against records the test writes, and another company's records never move them (LEARN13).
import { afterAll,beforeEach,expect,it } from 'vitest';
import { closePools,ownerPool,withSystem } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { seed } from '../scripts/seed';
import { ids } from '../lib/fixture';
import { companyHistory } from '../lib/services/company-history';
import * as start from '../app/api/demo/start/route';
beforeEach(async()=>{setAuthResolverForTests();const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterAll(async()=>{await closePools();});
const ws=ids.ridgeline;
const q=async(sql:string,a:unknown[]=[])=>withSystem(async db=>(await db.query(sql,a)).rows);
async function openJob(w=ws){return (await q("SELECT id,trade,site_id,client_id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') AND trade IS NOT NULL ORDER BY order_number LIMIT 1",[w]))[0];}
/** Writes finished jobs of a trade at a site, each with a real visit start and report time. */
async function finished(w:string,job:{trade:string;site_id:string;client_id:string},minutes:number[],outcome='fixed'){
 const by=(await q("SELECT user_id FROM members WHERE workspace_id=$1 AND role='admin' LIMIT 1",[w]))[0].user_id;
 for(const [i,m] of minutes.entries())await withSystem(async db=>{await db.query("SELECT set_config('app.user_id',$1,true)",[by]);
  await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,status,trade,created_by,scheduled_for,report_at,report_outcome,report_problem,report_work,created_at,updated_at)
   VALUES($1,$2,$3,'History job','done',$4,$5,now()-make_interval(days=>$6),now()-make_interval(days=>$6)+make_interval(mins=>$7),$8,'Problem','Work',now()-make_interval(days=>$6+1),now()-make_interval(days=>$6))`,[w,job.client_id,job.site_id,job.trade,by,10+i,m,outcome]);});
}
async function clearTrade(w:string,trade:string){await q("UPDATE work_orders SET trade='general' WHERE workspace_id=$1 AND status='done' AND trade=$2",[w,trade]);}
it('before: with no finished jobs of that trade, it gives no time and says so (based on 0)',async()=>{
 const job=await openJob();await clearTrade(ws,job.trade);
 expect(await companyHistory(ids.imran,ws,job.id)).toMatchObject({based_on:0,typical_minutes:null,site_repeat:null});
});
it('after: it learns the usual time from real finished jobs, a median rounded to 15 minutes, based on n jobs',async()=>{
 const job=await openJob();await clearTrade(ws,job.trade);
 await finished(ws,job,[60,90]);
 expect(await companyHistory(ids.imran,ws,job.id)).toMatchObject({based_on:2,typical_minutes:null});
 await finished(ws,job,[100,240,95],'temporary');
 const h=await companyHistory(ids.imran,ws,job.id);
 expect(h).toMatchObject({based_on:5,typical_minutes:90});
 expect(h.site_repeat).toMatchObject({count:5,temporary:3});
});
it('another company\'s history never changes these numbers, and that company learns only from its own',async()=>{
 const job=await openJob();await clearTrade(ws,job.trade);await finished(ws,job,[60,60,60]);
 const before=await companyHistory(ids.imran,ws,job.id);expect(before.typical_minutes).toBe(60);
 const s=await start.POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({persona:'imran'})}));const other=(await s.json()).workspace_id;
 const ojob=await openJob(other);await clearTrade(other,ojob.trade);await finished(other,ojob,[600,600,600,600]);
 expect(await companyHistory(ids.imran,ws,job.id)).toEqual(before);
 const oimran=(await q("SELECT user_id FROM members WHERE workspace_id=$1 AND role='admin' LIMIT 1",[other]))[0].user_id;
 expect((await companyHistory(oimran,other,ojob.id)).typical_minutes).toBe(600);
 await expect(companyHistory(oimran,ws,job.id)).rejects.toMatchObject({status:404});
});
it('office only: a technician and a client are refused',async()=>{
 const job=await openJob();
 await expect(companyHistory(ids.ravi,ws,job.id)).rejects.toMatchObject({status:403});
 await expect(companyHistory(ids.pranav,ws,job.id)).rejects.toMatchObject({status:403});
});
