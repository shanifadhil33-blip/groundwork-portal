// LEARN12: high impact lessons need an admin or owner yes. LEARN13: strict company separation for everything the agent learns.
import { afterAll,beforeEach,expect,it } from 'vitest';
import { closePools,ownerPool,withSystem,withUser } from '../lib/db';
import { setAuthResolverForTests } from '../lib/auth';
import { seed } from '../scripts/seed';
import { ids } from '../lib/fixture';
import { saveLearnedRule } from '../lib/services/habits';
import { LEARN_REPLIES, lessonImpact } from '../lib/learn-habits';
import { listLessons, decideLesson } from '../lib/services/lessons';
import { listAgentLearning } from '../lib/services/agent-learning';
import { companyHistory } from '../lib/services/company-history';
import * as start from '../app/api/demo/start/route';
beforeEach(async()=>{setAuthResolverForTests();const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterAll(async()=>{await closePools();});
const ws=ids.ridgeline;
const q=async(sql:string,a:unknown[]=[])=>withSystem(async db=>(await db.query(sql,a)).rows);
const learn=(user:string,rule:string,company=false,w=ws)=>withUser(user,db=>saveLearnedRule(db,user,w,rule,company));
const rules=async(w=ws)=>(await q('SELECT body FROM company_rules WHERE workspace_id=$1',[w])).map(r=>r.body);
const mine=async(user:string,w=ws)=>(await q('SELECT body FROM personal_agent_learning WHERE workspace_id=$1 AND user_id=$2',[w,user])).map(r=>r.body);
it('knows which lessons are high impact',()=>{
 expect(lessonImpact('From now on call me Joe',false)).toBeNull();
 expect(lessonImpact('Always start at 7',false)).toBeNull();
 expect(lessonImpact('Never charge the clinic for the first visit',false)).toBe('money');
 expect(lessonImpact('Always skip the gas check on small jobs',false)).toBe('safety');
 expect(lessonImpact('Never tell the client the price',false)).toBe('money');
 expect(lessonImpact('Always text the tenant first',false)).toBe('clients');
 expect(lessonImpact('Always start at 7',true)).toBe('company');
});
it('a low impact personal lesson is saved at once; a high impact one from a technician waits and is not used',async()=>{
 expect(await learn(ids.ravi,'From now on start my day at 7')).toBe(LEARN_REPLIES.saved);
 expect(await learn(ids.ravi,'Always skip the gas check on small jobs')).toBe(LEARN_REPLIES.waiting);
 expect(await mine(ids.ravi)).toEqual(['From now on start my day at 7']);
 expect(await learn(ids.ravi,'Always skip the gas check on small jobs')).toBe(LEARN_REPLIES.waiting);
 expect((await q("SELECT count(*)::int n FROM lesson_proposals WHERE workspace_id=$1 AND status='waiting'",[ws]))[0].n).toBe(1);
});
it('a supervisor\'s company lesson waits; the admin sees it with who and why, says yes, and the agent now uses it',async()=>{
 const before=await rules();
 expect(await learn(ids.sam,'From now on send Bilal to Al Majaz plumbing for the company',true)).toBe(LEARN_REPLIES.waiting);
 expect(await rules()).toEqual(before);
 const list=await listLessons(ids.imran,ws);expect(list.can_decide).toBe(true);
 expect(list.data).toHaveLength(1);expect(list.data[0]).toMatchObject({scope:'company',reason:'company',proposed_by_name:'Sam'});
 expect((await listLessons(ids.sam,ws)).can_decide).toBe(false);
 await expect(decideLesson(ids.sam,ws,list.data[0].id,{yes:true})).rejects.toMatchObject({status:403});
 expect(await decideLesson(ids.imran,ws,list.data[0].id,{yes:true})).toMatchObject({status:'approved'});
 expect(await rules()).toContain('From now on send Bilal to Al Majaz plumbing for the company');
 await expect(decideLesson(ids.imran,ws,list.data[0].id,{yes:false})).rejects.toMatchObject({status:409});
});
it('the admin can say no, and a yes on a personal lesson goes to that person\'s own memory only',async()=>{
 await learn(ids.ravi,'Never charge the clinic for the first visit');await learn(ids.ravi,'Always text the tenant first');
 const [a,b]=(await listLessons(ids.imran,ws)).data;
 expect(await decideLesson(ids.imran,ws,a.id,{yes:false})).toMatchObject({status:'declined'});
 await decideLesson(ids.imran,ws,b.id,{yes:true});
 expect(await mine(ids.ravi)).toEqual([b.body]);expect(await mine(ids.imran)).not.toContain(b.body);
 expect((await listLessons(ids.imran,ws)).data).toHaveLength(0);
});
it('an admin\'s own high impact lesson is saved at once',async()=>{
 expect(await learn(ids.imran,'Always text the tenant first for the company',true)).toBe(LEARN_REPLIES.companySaved);
});
it('LEARN13: another company never sees, decides or is changed by this company\'s lessons, rules, memory or history',async()=>{
 const s=await start.POST(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({persona:'imran'})}));const other=(await s.json()).workspace_id;
 const oadmin=(await q("SELECT user_id FROM members WHERE workspace_id=$1 AND role='admin' LIMIT 1",[other]))[0].user_id;
 const otech=(await q("SELECT user_id FROM members WHERE workspace_id=$1 AND role='technician' LIMIT 1",[other]))[0].user_id;
 await learn(ids.ravi,'Always skip the gas check on small jobs');await learn(ids.imran,'From now on lock the pump room for the company',true);await learn(ids.ravi,'From now on start my day at 7');
 const p=(await listLessons(ids.imran,ws)).data[0];
 // The other company's admin: not a member here, so every read and decision is refused or empty.
 await expect(listLessons(oadmin,ws)).rejects.toMatchObject({status:404});
 await expect(decideLesson(oadmin,ws,p.id,{yes:true})).rejects.toMatchObject({status:404});
 await expect(decideLesson(oadmin,other,p.id,{yes:true})).rejects.toMatchObject({status:404});
 expect((await listLessons(oadmin,other)).data.map((l: { body: string }) => l.body)).toEqual(['Always keep job notes short for the company.']);
 const job=(await q("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') LIMIT 1",[ws]))[0].id;
 await expect(companyHistory(oadmin,ws,job)).rejects.toMatchObject({status:404});
 await expect(companyHistory(oadmin,other,job)).rejects.toMatchObject({status:404});
 // Row level security, read straight as the other company's people.
 for(const u of [oadmin,otech]){
  const rows=await withUser(u,async db=>({
   rules:(await db.query('SELECT body FROM company_rules WHERE workspace_id=$1',[ws])).rows,
   memory:(await db.query('SELECT body FROM personal_agent_learning WHERE workspace_id=$1',[ws])).rows,
   lessons:(await db.query('SELECT body FROM lesson_proposals WHERE workspace_id=$1',[ws])).rows,
   any:(await db.query("SELECT body FROM lesson_proposals WHERE body LIKE '%gas check%'")).rows}));
  expect(rows).toEqual({rules:[],memory:[],lessons:[],any:[]});
 }
 await expect(withUser(oadmin,db=>db.query("INSERT INTO lesson_proposals(workspace_id,proposed_by,body,scope,reason) VALUES($1,$2,'Never charge','company','company')",[ws,oadmin]))).rejects.toThrow();
 // Their agent learning page shows only their own, and their rules did not change.
 const theirs=await listAgentLearning(oadmin,other);expect(JSON.stringify(theirs)).not.toMatch(/gas check|pump room|start my day at 7/);
 expect(await rules(other)).not.toContain('From now on lock the pump room for the company');
 // Inside the company a technician sees only his own waiting lesson, never another person's.
 await learn(ids.sam,'Never charge the clinic for the first visit');
 expect((await listLessons(ids.ravi,ws)).data.map((l:{body:string})=>l.body)).toEqual(['Always skip the gas check on small jobs']);
});
