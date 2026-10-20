import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { listAudit } from '../lib/services/audit';
import { closePools, withSystem, withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import { createWorkspace, deleteWorkspace, patchWorkspace, me } from '../lib/services/workspaces';
import { findCompany } from '../lib/services/onboarding';
import { createClient, createSite } from '../lib/services/clients';
import { searchCompanies, requestJoin, myJoinRequests, listJoinRequests, decideJoinRequest, editHomeAddress, readCompanyReplies } from '../lib/services/company-listing';
import { unreadCount, listNotifications } from '../lib/services/notifications';
import { setAuthResolverForTests } from '../lib/auth';
import { PATCH as decideRoute } from '../app/api/workspaces/[ws]/join-requests/[id]/route';
import { GET as searchRoute } from '../app/api/find-company/route';
import { POST as requestRoute } from '../app/api/join-requests/route';
import { PATCH as addressRoute } from '../app/api/workspaces/[ws]/sites/[id]/home-address/route';
let ws:string,hidden:string,demo:string,home:string,second:string,ownSite:string,otherSite:string;
let actor:string=ids.imran;
const users:string[]=[],companies:{id:string;name:string}[]=[];
const prefix='HOME02 test';
async function user(name='Resident',isDemo=false) {const id=randomUUID();users.push(id);await withSystem(db=>db.query('INSERT INTO users(id,name,email,phone,is_demo,demo_workspace_id,demo_persona) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,name,`${id}@example.test`,'+971501234567',isDemo,isDemo?demo:null,isDemo?'ravi':null]));return id;}
async function company(name:string){const w=await createWorkspace(ids.imran,{name});companies.push(w);return w.id as string;}
const body=(workspace_id=ws)=>({workspace_id,kind:'household',name:'My household',phone:'+971501234567',address:'Flat 7, Palm Road',note:'Our maintenance contract is with you.'});
beforeAll(async()=>{
 setAuthResolverForTests(async()=>actor);
 ws=await company(prefix+' listed');hidden=await company(prefix+' hidden');demo=randomUUID();companies.push({id:demo,name:prefix+' demo'});
 await withSystem(async db=>{await db.query('INSERT INTO workspaces(id,name,is_demo) VALUES($1,$2,true)',[demo,prefix+' demo']);});
 await patchWorkspace(ids.imran,ws,{listed:true,listing_area:'Palm neighbourhood'});
 await withSystem(async db=>{
  for(const [id,role,kind] of [[ids.ravi,'technician',null],[ids.sam,'staff',null],[ids.nabil,'staff','office']])await db.query('INSERT INTO members(workspace_id,user_id,role,staff_kind) VALUES($1,$2,$3,$4)',[ws,id,role,kind]);
 });
 const c=await createClient(ids.imran,ws,{name:'Existing business'});
 await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role,client_id,client_kind) VALUES($1,$2,'client',$3,'manager')",[ws,ids.pranav,c.id]));
 home=await user();second=await user('Other resident');
});
afterAll(async()=>{
 setAuthResolverForTests();
 for(const c of companies){if(c.id===demo){await withSystem(db=>db.query('DELETE FROM workspaces WHERE id=$1',[demo]));}else await deleteWorkspace(ids.imran,c.id,{confirm_name:c.name});await withSystem(db=>db.query('DELETE FROM audit_log WHERE workspace_id=$1',[c.id]));}
 await withSystem(db=>db.query('DELETE FROM users WHERE id=ANY($1::uuid[])',[users]));
 await closePools();
});
it('only consenting real companies are found, including through the old onboarding path',async()=>{
 const expected=[expect.objectContaining({id:ws,name:prefix+' listed',listing_area:'Palm neighbourhood'})];
 expect(await searchCompanies(home,prefix)).toEqual(expected);
 expect(await findCompany(home,'pALm')).toEqual(expected);
 expect(await withUser(home,async db=>(await db.query('SELECT * FROM onboarding_find_company($1)',[prefix])).rows)).toEqual([{name:prefix+' listed'}]);
 expect(Object.keys((await searchCompanies(home,prefix))[0]).sort()).toEqual(['id','listing_area','name','trades']);
 await expect(withSystem(db=>db.query('UPDATE workspaces SET listed=true WHERE id=$1',[demo]))).rejects.toMatchObject({code:'23514'});
});
it('search needs two characters and treats search punctuation literally',async()=>{
 for(const q of ['', ' ', 'P', ' P '])expect(await searchCompanies(home,q)).toEqual([]);
 expect(await searchCompanies(home,'Pa')).toHaveLength(1);
 expect(await searchCompanies(home,'%')).toEqual([]);
 actor=home;
 expect((await searchRoute(new Request('http://localhost/api/find-company?q=Pa'))).status).toBe(200);
});
it('only the owner or an admin can change the listing',async()=>{
 for(const id of [ids.ravi,ids.sam,ids.nabil,ids.pranav])await expect(patchWorkspace(id,ws,{listed:false,listing_area:'Hidden'})).rejects.toMatchObject({status:403});
 await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'admin')",[ws,ids.summitAdmin]));
 await expect(patchWorkspace(ids.summitAdmin,ws,{listed:false})).resolves.toMatchObject({listed:false});
 expect(await searchCompanies(home,prefix)).toEqual([]);
 await patchWorkspace(ids.imran,ws,{listed:true});
 await expect(patchWorkspace(ids.imran,ws,{listing_area:'x'.repeat(121)})).rejects.toBeTruthy();
});
it('one pending request per person and company, scoped to its requester',async()=>{
 const r=await requestJoin(home,body());
 await expect(requestJoin(home,body())).rejects.toMatchObject({status:409});
 const other=await requestJoin(second,{...body(),name:'Other household'});
 expect(await myJoinRequests(home)).toEqual([expect.objectContaining({id:r.id,status:'pending',company_name:prefix+' listed'})]);
 expect(await withUser(home,async db=>(await db.query('SELECT id FROM join_requests ORDER BY id')).rows)).toEqual([{id:r.id}]);
 expect(await withUser(second,async db=>(await db.query('SELECT id FROM join_requests ORDER BY id')).rows)).toEqual([{id:other.id}]);
 expect(await listJoinRequests(ids.nabil,ws)).toHaveLength(2);
 await expect(withUser(home,db=>db.query("UPDATE join_requests SET status='accepted' WHERE id=$1",[r.id]))).rejects.toMatchObject({code:'42501'});
});
it('does not request unlisted companies and requires a household address and bounded note',async()=>{
 actor=home;
 expect((await requestRoute(new Request('http://localhost/api/join-requests',{method:'POST',body:JSON.stringify(body(hidden))})) ).status).toBe(404);
 await expect(requestJoin(home,{...body(),address:' '})).rejects.toBeTruthy();
 await expect(requestJoin(home,{...body(),note:'x'.repeat(301)})).rejects.toBeTruthy();
});
it('Ravi, Sam and Pranav get 403 when deciding or reading requests',async()=>{
 const r=(await myJoinRequests(home))[0];
 for(const id of [ids.ravi,ids.sam,ids.pranav]){
  actor=id;
  for(const status of ['accepted','declined']){
   const response=await decideRoute(new Request('http://localhost/api',{method:'PATCH',body:JSON.stringify({status})}),{params:Promise.resolve({ws,id:r.id})});expect(response.status).toBe(403);
  }
  await expect(listJoinRequests(id,ws)).rejects.toMatchObject({status:403});
  await expect(withUser(id,db=>db.query('SELECT decide_company_join($1,$2,$3)',[ws,r.id,'accepted']))).rejects.toMatchObject({code:'P0403'});
 }
});
it('Imran accepts atomically, creating a household, its addressed site and an audited reply',async()=>{
 const r=(await myJoinRequests(home))[0];
 const accepted=await decideJoinRequest(ids.imran,ws,r.id,{status:'accepted'});
 expect(accepted).toMatchObject({status:'accepted',decided_by:ids.imran});
 expect((await me(home)).user.phone).toBe('+971501234567');
 expect((await me(home)).memberships).toContainEqual(expect.objectContaining({workspace_id:ws,role:'client',client_kind:'household',client_id:accepted.client_id}));
 const site=await withUser(home,async db=>(await db.query('SELECT * FROM sites WHERE workspace_id=$1',[ws])).rows[0]);ownSite=site.id;
 expect(site).toMatchObject({address:body().address,client_id:accepted.client_id});
 expect((await listNotifications(home,ws,new URLSearchParams())).data).toContainEqual(expect.objectContaining({kind:'company_join_accepted',message:'Your request to join was accepted. Open Find your company to continue.'}));
 expect((await unreadCount(home)).company_replies).toBe(1);
 await readCompanyReplies(home);expect((await unreadCount(home)).company_replies).toBe(0);
 expect(await withSystem(async db=>(await db.query("SELECT actor_id FROM audit_log WHERE entity='join_requests' AND entity_id=$1 AND action='update' AND \"after\"->>'status'='accepted'",[r.id])).rows)).toEqual([{actor_id:ids.imran}]);
 expect((await listAudit(ids.imran,ws,new URLSearchParams('entity=join_requests'))).data).toContainEqual(expect.objectContaining({summary:'Accepted a request to join.'}));
 await expect(decideJoinRequest(ids.imran,ws,r.id,{status:'accepted'})).rejects.toMatchObject({status:409});
});
it('office staff can decline and the non member gets a private reply and audit line',async()=>{
 const r=(await myJoinRequests(second))[0];
 await expect(decideJoinRequest(ids.nabil,ws,r.id,{status:'declined'})).resolves.toMatchObject({status:'declined',decided_by:ids.nabil,client_id:null});
 expect((await me(second)).memberships).toEqual([]);
 expect(await myJoinRequests(second)).toEqual([expect.objectContaining({id:r.id,status:'declined'})]);
 expect((await unreadCount(second)).company_replies).toBe(1);
 await readCompanyReplies(home);expect((await unreadCount(second)).company_replies).toBe(1);
 expect(await withSystem(async db=>(await db.query("SELECT actor_id FROM audit_log WHERE entity='join_requests' AND entity_id=$1 AND \"after\"->>'status'='declined'",[r.id])).rows)).toEqual([{actor_id:ids.nabil}]);
 // Decline releases the pending slot.
 await expect(requestJoin(second,body())).resolves.toMatchObject({status:'pending'});
});
it('office staff can accept a business and a second request cannot create duplicate records',async()=>{
 const business=await user('Business contact');const r=await requestJoin(business,{...body(),kind:'manager',name:'Palm Business',address:''});
 await decideJoinRequest(ids.nabil,ws,r.id,{status:'accepted'});
 expect((await me(business)).memberships[0]).toMatchObject({role:'client',client_kind:'manager',client_name:'Palm Business'});
 const r2=(await myJoinRequests(second)).find(r=>r.status==='pending')!;
 const results=await Promise.allSettled([decideJoinRequest(ids.imran,ws,r2.id,{status:'accepted'}),decideJoinRequest(ids.nabil,ws,r2.id,{status:'accepted'})]);
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 otherSite=await withSystem(async db=>(await db.query('SELECT s.id FROM sites s JOIN members m ON m.client_id=s.client_id AND m.workspace_id=s.workspace_id WHERE m.workspace_id=$1 AND m.user_id=$2',[ws,second])).rows[0].id);
});
it('a household edits only its own home, including through the database function',async()=>{
 expect(await editHomeAddress(home,ws,ownSite,{address:'Flat 8, Palm Road'})).toMatchObject({address:'Flat 8, Palm Road'});
 await expect(editHomeAddress(home,ws,otherSite,{address:'Foreign home'})).rejects.toMatchObject({status:403});
 await expect(editHomeAddress(ids.pranav,ws,ownSite,{address:'Not mine'})).rejects.toMatchObject({status:403});
 await expect(withUser(home,db=>db.query('SELECT edit_household_address($1,$2,$3)',[ws,otherSite,'Foreign home']))).rejects.toMatchObject({code:'P0403'});
 actor=home;expect((await addressRoute(new Request('http://localhost/api',{method:'PATCH',body:JSON.stringify({address:'Foreign home'})}),{params:Promise.resolve({ws,id:otherSite})})).status).toBe(403);
 expect(await withSystem(async db=>(await db.query('SELECT address FROM sites WHERE id=$1',[otherSite])).rows[0].address)).toBe(body().address);
});
it('demo identities get the existing refusal',async()=>{
 const d=await user('Demo resident',true);
 for(const action of [()=>searchCompanies(d,prefix),()=>requestJoin(d,body()),()=>myJoinRequests(d),()=>patchWorkspace(d,ws,{listed:true})])await expect(action()).rejects.toMatchObject({code:'P0403'});
 actor=d;expect((await searchRoute(new Request('http://localhost/api/find-company?q=Pa'))).status).toBe(403);
 expect((await requestRoute(new Request('http://localhost/api/join-requests',{method:'POST',body:JSON.stringify(body())}))).status).toBe(403);
});
it('migration rollback and reapply work inside a local transaction',async()=>{
 await withSystem(async db=>{await db.query('SAVEPOINT home02');try{await db.query(readFileSync('db/rollbacks/rollback-0063_company_listing.sql','utf8'));expect((await db.query("SELECT to_regclass('join_requests') AS t")).rows[0].t).toBeNull();await db.query(readFileSync('db/migrations/0063_company_listing.sql','utf8'));expect((await db.query("SELECT to_regclass('join_requests') AS t")).rows[0].t).toBe('join_requests');}finally{await db.query('ROLLBACK TO SAVEPOINT home02');}});
});
