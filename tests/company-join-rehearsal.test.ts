import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { closePools, withSystem, withUser } from '../lib/db';
import { startDemo, resetDemo } from '../lib/services/demo';
import { ids } from '../lib/fixture';
import { setAuthResolverForTests } from '../lib/auth';
import * as s from '../lib/services/company-join-rehearsal';
import * as real from '../lib/services/company-listing';
import * as route from '../app/api/demo/company-joining/route';
let ws:string,second:string;let people:Record<string,string>,other:Record<string,string>;let actor:string;
const sandboxes:string[]=[];
async function cast(id:string){return withSystem(async db=>Object.fromEntries((await db.query('SELECT demo_persona,id FROM users WHERE demo_workspace_id=$1',[id])).rows.map(r=>[r.demo_persona,r.id])));}
beforeAll(async()=>{
 for(let n=0;n<2;n++)sandboxes.push((await startDemo({persona:'faisal'},`join-rehearsal-${n}`)).body.workspace_id);
 [ws,second]=sandboxes;people=await cast(ws);other=await cast(second);actor=people.faisal;setAuthResolverForTests(async()=>actor);
});
afterAll(async()=>{vi.unstubAllGlobals();setAuthResolverForTests();await withSystem(async db=>{for(const id of sandboxes)await db.query('SELECT delete_demo_workspace($1)',[id]);});await closePools();});
const body=()=>({workspace_id:ws,kind:'household',name:'Yusuf',phone:'+971000000000',address:'Flat 14, Sample Court',note:''});
async function untouched(){return withSystem(async db=>(await db.query(`SELECT
 (SELECT count(*) FROM users)::int AS users,(SELECT count(*) FROM members)::int AS members,
 (SELECT count(*) FROM workspaces)::int AS workspaces,(SELECT count(*) FROM clients)::int AS clients,
 (SELECT count(*) FROM sites)::int AS sites,(SELECT count(*) FROM join_requests)::int AS joins,
 (SELECT count(*) FROM onboarding_progress)::int AS onboarding,(SELECT count(*) FROM invites)::int AS invites,
 (SELECT count(*) FROM login_links)::int AS links,(SELECT count(*) FROM accounts)::int AS accounts,
 (SELECT count(*) FROM sessions)::int AS sessions,(SELECT count(*) FROM notifications)::int AS notices,
 (SELECT listed FROM workspaces WHERE id=$1) AS listed`,[ws])).rows[0]);}
it('searches only the current unlisted sample company with at least two characters and seeds fictional form details',async()=>{
 for(const q of ['', ' ', 'R',' R ','%','_','Summit','Dune'])expect(await s.searchPracticeCompanies(people.faisal,q)).toEqual([]);
 expect(await s.searchPracticeCompanies(people.faisal,' rI ')).toEqual([expect.objectContaining({id:ws,name:'Ridgeline Facility Services'})]);
 expect((await s.searchPracticeCompanies(other.faisal,'Ri'))[0].id).toBe(second);
 expect(await s.practiceJoinDetails(people.faisal)).toEqual({name:'Yusuf',phone:'+971000000000',address:'Flat 14, Sample Court',note:'',kind:'household'});
 expect(await s.myPracticeJoinRequests(people.faisal)).toEqual([]);
});
it('records a pending preview and lets only its own office decide, without changing identity, listings or delivering anything',async()=>{
 const before=await untouched(),fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 const receipt=await s.requestPracticeJoin(people.faisal,body());expect(receipt).toMatchObject({...body(),status:'pending',simulated:true});
 expect(await s.myPracticeJoinRequests(people.faisal)).toEqual([receipt]);
 expect(await s.listPracticeJoinRequests(people.imran,ws)).toEqual([receipt]);expect(await s.listPracticeJoinRequests(people.nabil,ws)).toEqual([receipt]);
 expect(await s.myPracticeJoinRequests(other.faisal)).toEqual([]);expect(await s.listPracticeJoinRequests(other.imran,second)).toEqual([]);
 await expect(s.requestPracticeJoin(people.faisal,body())).rejects.toMatchObject({status:409});
 const results=await Promise.allSettled([s.decidePracticeJoinRequest(people.imran,{workspace_id:ws,id:receipt.id,status:'accepted'}),s.decidePracticeJoinRequest(people.nabil,{workspace_id:ws,id:receipt.id,status:'declined'})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);expect(results.filter(r=>r.status==='rejected')).toHaveLength(1);
 const updated=(await s.myPracticeJoinRequests(people.faisal))[0];expect(['accepted','declined']).toContain(updated.status);expect(updated.simulated).toBe(true);
 expect(await untouched()).toEqual(before);expect(fetch).not.toHaveBeenCalled();vi.unstubAllGlobals();
});
it('supports decline and accept replies, permits a fresh rehearsal, and prevents replay of an answered request',async()=>{
 const before=await untouched();
 for(const [status,user] of [['declined',people.nabil],['accepted',people.imran]]){
  const pending=await s.requestPracticeJoin(people.faisal,body());
  const result=await s.decidePracticeJoinRequest(user,{workspace_id:ws,id:pending.id,status});
  expect(result).toMatchObject({status,simulated:true,decided_by:user});
  expect(await s.myPracticeJoinRequests(people.faisal)).toContainEqual(result);
  await expect(s.decidePracticeJoinRequest(user,{workspace_id:ws,id:pending.id,status})).rejects.toMatchObject({status:409});
 }
 expect(await untouched()).toEqual(before);
});
it('validates fictional contact, required address, kinds, lengths and unexpected fields',async()=>{
 for(const change of [{name:' '},{phone:'+971501234567'},{address:' '},{name:'a'.repeat(201)},{address:'a'.repeat(2001)},{note:'a'.repeat(301)},{kind:'admin'},{token:'anything'}])await expect(s.requestPracticeJoin(people.faisal,{...body(),...change})).rejects.toBeTruthy();
 await expect(s.searchPracticeCompanies(people.faisal,'x'.repeat(121))).rejects.toBeTruthy();
 await expect(s.decidePracticeJoinRequest(people.imran,{workspace_id:ws,id:ws,status:'pending'})).rejects.toBeTruthy();
});
it('enforces requester, office, cross sandbox and existing SQL identity boundaries',async()=>{
 const pending=await s.requestPracticeJoin(people.faisal,body());
 for(const key of ['sam','ravi','pranav','omar','kevin','faisal']){
  await expect(s.listPracticeJoinRequests(people[key],ws)).rejects.toMatchObject({status:403});
  await expect(s.decidePracticeJoinRequest(people[key],{workspace_id:ws,id:pending.id,status:'accepted'})).rejects.toMatchObject({status:403});
 }
 for(const key of ['imran','sam','ravi','nabil','pranav','omar','kevin']){
  await expect(s.requestPracticeJoin(people[key],body())).rejects.toMatchObject({status:403});
  await expect(s.myPracticeJoinRequests(people[key])).rejects.toMatchObject({status:403});
 }
 await expect(s.requestPracticeJoin(people.faisal,{...body(),workspace_id:second})).rejects.toMatchObject({status:404});
 await expect(s.requestPracticeJoin(people.faisal,{...body(),workspace_id:ids.ridgeline})).rejects.toMatchObject({status:404});
 await expect(s.listPracticeJoinRequests(other.imran,ws)).rejects.toMatchObject({status:404});
 await expect(s.decidePracticeJoinRequest(other.imran,{workspace_id:second,id:pending.id,status:'accepted'})).rejects.toMatchObject({status:404});
 expect((await withUser(people.pranav,db=>db.query('SELECT result FROM idempotency_keys WHERE user_id=$1',[people.faisal]))).rows).toEqual([]);
 for(const action of [()=>real.searchCompanies(people.faisal,'Ri'),()=>real.requestJoin(people.faisal,body()),()=>real.myJoinRequests(people.faisal),()=>real.decideJoinRequest(people.imran,ws,pending.id,{status:'accepted'})])await expect(action()).rejects.toMatchObject({code:'P0403'});
 await expect(withUser(people.faisal,db=>db.query('SELECT * FROM search_listed_companies($1)',['Ri']))).rejects.toMatchObject({code:'P0403'});
 await expect(withUser(people.faisal,db=>db.query('SELECT * FROM request_company_join($1,$2,$3,$4,$5,$6)',[ws,'household','Yusuf','+971000000000','Sample Court','']))).rejects.toMatchObject({code:'P0403'});
});
it('the authenticated route dispatches practice reads and writes and refuses real accounts',async()=>{
 actor=other.faisal;
 expect((await route.GET(new Request('http://localhost/api/demo/company-joining?q=Ri'))).status).toBe(200);
 expect((await route.GET(new Request('http://localhost/api/demo/company-joining?details=1'))).status).toBe(200);
 const created=await route.POST(new Request('http://localhost/api/demo/company-joining',{method:'POST',body:JSON.stringify({...body(),workspace_id:second})}));expect(created.status).toBe(201);const record=await created.json();
 actor=other.nabil;
 expect((await route.GET(new Request(`http://localhost/api/demo/company-joining?workspace=${second}`))).status).toBe(200);
 expect((await route.PATCH(new Request('http://localhost/api/demo/company-joining',{method:'PATCH',body:JSON.stringify({workspace_id:second,id:record.id,status:'declined'})}))).status).toBe(200);
 actor=other.faisal;
 expect(await (await route.GET(new Request('http://localhost/api/demo/company-joining'))).json()).toContainEqual(expect.objectContaining({status:'declined',simulated:true}));
 actor=ids.imran;
 for(const url of ['', '?q=Ri','?details=1',`?workspace=${ws}`])expect((await route.GET(new Request(`http://localhost/api/demo/company-joining${url}`))).status).toBe(404);
 expect((await route.POST(new Request('http://localhost/api/demo/company-joining',{method:'POST',body:JSON.stringify(body())}))).status).toBe(404);
 expect((await route.PATCH(new Request('http://localhost/api/demo/company-joining',{method:'PATCH',body:JSON.stringify({workspace_id:ws,id:ws,status:'accepted'})}))).status).toBe(404);
});
it('rejects expired and archived actors and resets drafts and replies to the sandbox fixture',async()=>{
 await withSystem(db=>db.query('UPDATE members SET archived_at=now() WHERE user_id=$1 AND workspace_id=$2',[people.faisal,ws]));
 await expect(s.myPracticeJoinRequests(people.faisal)).rejects.toMatchObject({status:404});
 await withSystem(db=>db.query('UPDATE members SET archived_at=null WHERE user_id=$1 AND workspace_id=$2',[people.faisal,ws]));
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 second' WHERE id=$1",[ws]));
 await expect(s.searchPracticeCompanies(people.faisal,'Ri')).rejects.toMatchObject({status:404});
 await expect(s.requestPracticeJoin(people.faisal,body())).rejects.toMatchObject({status:404});
 await expect(s.listPracticeJoinRequests(people.imran,ws)).rejects.toMatchObject({status:404});
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()+interval '1 hour' WHERE id=$1",[ws]));
 const previous=ws;ws=(await resetDemo(people.faisal,{confirm:true})).body.workspace_id;sandboxes.push(ws);people=await cast(ws);
 expect(await s.myPracticeJoinRequests(people.faisal)).toEqual([]);expect(await s.listPracticeJoinRequests(people.imran,ws)).toEqual([]);
 expect(await s.practiceJoinDetails(people.faisal)).toMatchObject({name:'Yusuf',address:'Flat 14, Sample Court'});
 expect((await withSystem(db=>db.query('SELECT 1 FROM idempotency_keys WHERE scope LIKE $1',[previous+'/%']))).rows).toEqual([]);
});
