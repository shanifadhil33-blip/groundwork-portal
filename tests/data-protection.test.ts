import { afterAll, beforeEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { closePools, ownerPool, withSystem } from '../lib/db';
import { seed, ids, orderId } from '../scripts/seed';
import { exportPersonalData, exportCompanyData, requestAccountDeletion, deletionRequests, handleAccountDeletion, cleanupPersonalData, closeCompanyForPrivacy, requestMyAccountDeletion } from '../lib/services/data-protection';
import { unarchiveMember } from '../lib/services/members';
import { setAuthResolverForTests, getSessionUserId } from '../lib/auth';
import { seal } from '../lib/secret-box';
import { GET as download } from '../app/api/workspaces/[ws]/data/route';
import { POST as requestRoute } from '../app/api/workspaces/[ws]/deletion-requests/route';
import { startDemo, switchDemo, resetDemo } from '../lib/services/demo';
const ws = ids.ridgeline;
let actor: string | null = ids.imran;
beforeEach(async () => { const db=await ownerPool.connect();try {await seed(db);} finally {db.release();} actor=ids.imran;setAuthResolverForTests(async()=>actor); });
afterAll(async () => { setAuthResolverForTests();await closePools(); });
async function role(user:string, role:string, kind?:string) {
  await withSystem(db=>db.query('UPDATE members SET role=$3,staff_kind=$4,client_kind=$5 WHERE workspace_id=$1 AND user_id=$2', [ws,user,role,role==='staff'?kind??null:null,role==='client'?kind??'manager':null]));
}
it.each([
  ['owner',ids.imran,'admin',null], ['admin',ids.sam,'admin',null], ['supervisor',ids.sam,'staff',null],
  ['office',ids.sam,'staff','office'], ['technician',ids.ravi,'technician',null],
  ['facility manager',ids.pranav,'client','manager'], ['client staff',ids.pranav,'client','office'], ['household',ids.pranav,'client','household'],
])('%s exports only their profile, preferences and own work', async (_label,user,r,kind) => {
  await role(user,r,kind??undefined);
  const data=await exportPersonalData(user,ws);
  expect(data.profile.id).toBe(user);
  expect(data.companies).toHaveLength(1);
  expect(data.companies[0].workspace_id).toBe(ws);
  for(const j of data.companies[0].jobs) expect(j.created_by_me||j.assigned_to_me).toBe(true);
  const text=JSON.stringify(data);
  expect(text).not.toContain('token_hash');expect(text).not.toContain('sender_phone');expect(text).not.toContain('tenant_phone');
  expect(text).not.toContain('report_by');expect(text).not.toContain(ids.summit);
  if(user!==ids.imran) expect(text).not.toContain('imran@');
});
it.each([['admin',null],['staff',null],['staff','office'],['technician',null],['client','manager'],['client','office'],['client','household']])('company export is checked on server for %s %s',async(r,kind)=>{
  const user=r==='client'?ids.pranav:r==='technician'?ids.ravi:ids.sam;
  await role(user,r!,kind??undefined);
  if(r==='admin') {const data=await exportCompanyData(user,ws);expect(data.company.id).toBe(ws);expect(data.records.work_orders.length).toBeGreaterThan(1);}
  else await expect(exportCompanyData(user,ws)).rejects.toMatchObject({status:403});
});
it('owner company export contains company work but no personal Agent memory, preferences, credentials or sealed values',async()=>{
  await withSystem(db=>db.query("INSERT INTO personal_agent_learning(workspace_id,user_id,body) VALUES($1,$2,'Private secret memory')",[ws,ids.sam]));
  const data=await exportCompanyData(ids.imran,ws), text=JSON.stringify(data);
  expect(data.records.members.length).toBeGreaterThan(1);
  for(const secret of ['Private secret memory','token_hash','sessionToken','phone_sealed','user_preferences']) expect(text).not.toContain(secret);
});
it('rejects a cross company export and unauthenticated route, uses private attachment headers',async()=>{
  for(const fn of [exportPersonalData,exportCompanyData]) await expect(fn(ids.summitAdmin,ws)).rejects.toMatchObject({status:404});
  const context={params:Promise.resolve({ws})};
  actor=ids.summitAdmin;expect((await download(new Request('http://localhost/api?scope=company'),context)).status).toBe(404);
  actor=null;expect((await download(new Request('http://localhost/api'),context)).status).toBe(401);
  actor=ids.ravi;const response=await download(new Request('http://localhost/api'),context);
  expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');
  expect(response.headers.get('content-disposition')).toContain('attachment');
  expect((await download(new Request('http://localhost/api',{headers:{'groundwork-user':ids.sam}}),context)).status).toBe(409);
});
it('opens only the owner own sealed fields and excludes sign in code messages',async()=>{
  const secret=process.env.AUTH_SECRET!;
  await withSystem(async db=>{
    for(const user of [ids.ravi,ids.sam]) await db.query(`INSERT INTO whatsapp_messages(workspace_id,user_id,phone_sealed,body_sealed,voice_sealed,direction,kind)
      VALUES($1,$2,$3,$4,$5,'in','voice')`,[ws,user,seal(user===ids.ravi?'971500001111':'971500002222',secret),seal(user===ids.ravi?'My own message':'Someone else private message',secret),seal(user===ids.ravi?'My voice':'Someone else voice',secret)]);
    await db.query("INSERT INTO whatsapp_messages(workspace_id,user_id,phone_sealed,body_sealed,direction,kind) VALUES($1,$2,$3,$4,'out','code')",[ws,ids.ravi,seal('971500001111',secret),seal('123456',secret)]);
  });
  const own=JSON.stringify(await exportPersonalData(ids.ravi,ws));
  expect(own).toContain('My own message');expect(own).toContain('My voice');expect(own).not.toContain('Someone else');expect(own).not.toContain('123456');expect(own).not.toContain('gw1.');
  const company=JSON.stringify(await exportCompanyData(ids.imran,ws));expect(company).not.toContain('My voice');expect(company).not.toContain('Someone else voice');
});
it('leave, comments and reports are scoped to the author even for an admin',async()=>{
  await withSystem(async db=>{
    await db.query("INSERT INTO time_off(workspace_id,user_id,kind,starts_on,ends_on,note) VALUES($1,$2,'leave','2026-10-22','2026-10-23','Other leave secret')",[ws,ids.ravi]);
    await db.query("UPDATE work_orders SET report_by=$2,report_problem='Other report secret' WHERE id=$1",[orderId(1),ids.ravi]);
    await db.query("INSERT INTO comments(workspace_id,client_id,work_order_id,author_id,body,visibility) SELECT workspace_id,client_id,id,$2,'Other comment secret','internal' FROM work_orders WHERE id=$1",[orderId(1),ids.ravi]);
  });
  const data=JSON.stringify(await exportPersonalData(ids.imran,ws));
  for(const text of ['Other leave secret','Other report secret','Other comment secret']) expect(data).not.toContain(text);
  const own=JSON.stringify(await exportPersonalData(ids.ravi,ws));expect(own).toContain('Other leave secret');expect(own).toContain('Other report secret');expect(own).toContain('Other comment secret');
});
it('ratings obey existing visibility including hidden low office ratings and high technician thanks',async()=>{
  await withSystem(async db=>{
    await db.query("UPDATE work_orders SET status='done',assignee_id=$2 WHERE id=$1",[orderId(1),ids.ravi]);
    await db.query('UPDATE members SET client_id=(SELECT client_id FROM work_orders WHERE id=$1) WHERE user_id=$2 AND workspace_id=$3',[orderId(1),ids.pranav,ws]);
  });
  await withSystem(db=>db.query("INSERT INTO job_ratings(work_order_id,workspace_id,client_id,rated_by,stars,note) SELECT id,workspace_id,client_id,$2,1,'Private low rating' FROM work_orders WHERE id=$1",[orderId(1),ids.pranav]),ids.pranav);
  await role(ids.sam,'staff','office');
  expect(JSON.stringify(await exportPersonalData(ids.sam,ws))).not.toContain('Private low rating');
  expect(JSON.stringify(await exportPersonalData(ids.ravi,ws))).not.toContain('Private low rating');
});
it('request is confirmed, idempotent, private to the requester and company admin',async()=>{
  await expect(requestAccountDeletion(ids.ravi,ws,{confirm:false})).rejects.toThrow();
  await requestAccountDeletion(ids.ravi,ws,{confirm:true});await requestAccountDeletion(ids.ravi,ws,{confirm:true});
  expect((await deletionRequests(ids.ravi,ws)).requests).toHaveLength(1);
  expect((await deletionRequests(ids.sam,ws)).requests).toHaveLength(0);
  expect((await deletionRequests(ids.imran,ws)).requests).toHaveLength(1);
  await expect(deletionRequests(ids.summitAdmin,ws)).rejects.toMatchObject({status:404});
  await expect(requestAccountDeletion(ids.imran,ws,{confirm:true})).rejects.toMatchObject({status:409});
  actor=ids.ravi;expect((await requestRoute(new Request('http://localhost/api',{method:'POST',body:JSON.stringify({confirm:true,user_id:ids.sam})}),{params:Promise.resolve({ws})})).status).toBe(422);
});
it.each([['staff',null],['staff','office'],['technician',null],['client','manager'],['client','office'],['client','household']])('%s %s cannot handle a request',async(r,kind)=>{
  await requestAccountDeletion(ids.ravi,ws,{confirm:true});
  const user=r==='client'?ids.pranav:r==='technician'?ids.ravi:ids.sam;
  await role(user,r!,kind??undefined);
  await expect(handleAccountDeletion(user,ws,ids.ravi,{confirm:true})).rejects.toMatchObject({status:403});
});
it('cross company admin cannot delete an account and no request cannot be approved',async()=>{
  await requestAccountDeletion(ids.ravi,ws,{confirm:true});
  await expect(handleAccountDeletion(ids.summitAdmin,ws,ids.ravi,{confirm:true})).rejects.toMatchObject({status:404});
  await expect(handleAccountDeletion(ids.imran,ws,ids.sam,{confirm:true})).rejects.toMatchObject({status:404});
});
it('admin handles confirmed deletion, removes credentials and personal fields, keeps anonymised job history and cannot restore account',async()=>{
  await role(ids.sam,'admin');
  await withSystem(async db=>{
    await db.query("UPDATE users SET email='erase@example.test',phone='+971501234567',image='private-avatar' WHERE id=$1",[ids.ravi]);
    await db.query("INSERT INTO sessions(\"userId\",\"sessionToken\",expires) VALUES($1,'erase-session',now()+interval '1 day')",[ids.ravi]);
    await db.query("INSERT INTO comments(workspace_id,client_id,work_order_id,author_id,body,visibility) SELECT workspace_id,client_id,id,$2,'Job history stays','internal' FROM work_orders WHERE id=$1",[orderId(1),ids.ravi]);
    await db.query("INSERT INTO personal_agent_learning(workspace_id,user_id,body) VALUES($1,$2,'Erase my memory')",[ws,ids.ravi]);
  });
  const before=await withSystem(async db=>(await db.query('SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1',[ws])).rows[0].n);
  await requestAccountDeletion(ids.ravi,ws,{confirm:true});
  expect(await handleAccountDeletion(ids.sam,ws,ids.ravi,{confirm:true})).toMatchObject({completed:true,practice:false});
  await withSystem(async db=>{
    expect((await db.query('SELECT name,email,phone,image FROM users WHERE id=$1',[ids.ravi])).rows[0]).toEqual({name:'Deleted person',email:null,phone:null,image:null});
    expect((await db.query('SELECT count(*)::int n FROM work_orders WHERE workspace_id=$1',[ws])).rows[0].n).toBe(before);
    expect((await db.query("SELECT author_name FROM comments WHERE body='Job history stays'")).rows[0].author_name).toBe('Deleted person');
    for(const table of ['sessions','personal_agent_learning']) expect((await db.query(`SELECT 1 FROM ${table} WHERE ${table==='sessions'?'"userId"':'user_id'}=$1`,[ids.ravi])).rowCount).toBe(0);
    expect(JSON.stringify((await db.query('SELECT "before","after" FROM audit_log WHERE workspace_id=$1',[ws])).rows)).not.toContain('erase@example.test');
  });
  expect(await getSessionUserId(new Request('http://localhost',{headers:{cookie:'authjs.session-token=erase-session'}}))).toBeNull();
  await expect(unarchiveMember(ids.imran,ws,ids.ravi)).rejects.toMatchObject({status:409,code:'account_deleted'});
  expect(await handleAccountDeletion(ids.sam,ws,ids.ravi,{confirm:true})).toMatchObject({completed:true});
});
it('all companies must approve and an admin sees only their company receipt',async()=>{
  await withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'technician')",[ids.summit,ids.ravi]));
  await requestAccountDeletion(ids.ravi,ws,{confirm:true});
  expect(await handleAccountDeletion(ids.imran,ws,ids.ravi,{confirm:true})).toMatchObject({completed:false});
  expect((await withSystem(db=>db.query('SELECT name FROM users WHERE id=$1',[ids.ravi]))).rows[0].name).not.toBe('Deleted person');
  const other=await deletionRequests(ids.summitAdmin,ids.summit);expect(other.requests).toHaveLength(1);expect(other.requests[0].status).toBe('pending');
  expect(await handleAccountDeletion(ids.summitAdmin,ids.summit,ids.ravi,{confirm:true})).toMatchObject({completed:true});
});
it('sandbox request, approval and company closure are practice only and reset with sandbox',async()=>{
  const demo=await startDemo({persona:'ravi'},'sec07-practice');
  const sandbox=demo.body.workspace_id;
  const users=(await withSystem(db=>db.query('SELECT id,demo_persona FROM users WHERE demo_workspace_id=$1',[sandbox]))).rows;
  const tech=users.find(u=>u.demo_persona==='ravi')!.id,owner=users.find(u=>u.demo_persona==='imran')!.id;
  await requestAccountDeletion(tech,sandbox,{confirm:true});
  expect(await handleAccountDeletion(owner,sandbox,tech,{confirm:true})).toMatchObject({completed:true,practice:true});
  expect(await closeCompanyForPrivacy(owner,sandbox,{confirm:true})).toMatchObject({closed:true,practice:true});
  expect((await exportPersonalData(tech,sandbox)).profile.name).toBe('Ravi');
  expect((await switchDemo(owner,{persona:'ravi'})).body.persona).toBe('ravi');
  const reset=await resetDemo(tech,{confirm:true});
  expect(reset.body.workspace_id).not.toBe(sandbox);
  expect((await withSystem(db=>db.query('SELECT 1 FROM idempotency_keys WHERE scope=$1',['sec07:delete:'+sandbox]))).rowCount).toBe(0);
});
it('only the owner can close the company and confirmation is required',async()=>{
  await role(ids.sam,'admin');
  await expect(closeCompanyForPrivacy(ids.sam,ws,{confirm:true})).rejects.toMatchObject({status:403});
  await expect(closeCompanyForPrivacy(ids.imran,ws,{confirm:false})).rejects.toThrow();
  await expect(closeCompanyForPrivacy(ids.summitAdmin,ws,{confirm:true})).rejects.toMatchObject({status:404});
  expect(await closeCompanyForPrivacy(ids.imran,ws,{confirm:true})).toMatchObject({closed:true,practice:false});
  expect((await withSystem(db=>db.query('SELECT 1 FROM workspaces WHERE id=$1',[ws]))).rowCount).toBe(0);
});
it('retention removes expired secrets and old read notifications, keeps active and unread records and is repeatable',async()=>{
  await withSystem(async db=>{
    for(const [token,expires] of [['expired','-1 hour'],['active','1 hour']]) {
      await db.query(`INSERT INTO sessions("userId","sessionToken",expires) VALUES($1,$2,now()+$3::interval)`,[ids.ravi,token,expires]);
      await db.query('INSERT INTO verification_token(identifier,token,expires) VALUES($1,$2,now()+$3::interval)',['sec07',token,expires]);
      await db.query('INSERT INTO login_links(workspace_id,user_id,token_hash,code_hash,expires_at) VALUES($1,$2,$3,$3,now()+$4::interval)',[ws,ids.ravi,token,expires]);
      await db.query("INSERT INTO phone_changes(user_id,phone_lookup,phone_sealed,code_hash,expires_at) VALUES($1,$2,$2,$2,now()+$3::interval)",[ids.ravi,token,expires]);
    }
    await db.query("INSERT INTO login_attempts(ip_hash,created_at) VALUES('old',now()-interval '2 days'),('recent',now())");
    for(const read of [true,false]) await db.query("INSERT INTO notifications(user_id,workspace_id,kind,created_at,read_at) VALUES($1,$2,'sec07',now()-interval '91 days',CASE WHEN $3 THEN now() ELSE NULL END)",[ids.ravi,ws,read]);
  });
  const counts=await cleanupPersonalData();expect(counts.sessions).toBe(1);expect(counts.phone_changes).toBe(1);expect(counts.notifications).toBe(1);expect(counts.login_attempts).toBe(1);
  await withSystem(async db=>{
    expect((await db.query("SELECT \"sessionToken\" FROM sessions")).rows).toEqual([{sessionToken:'active'}]);
    expect((await db.query("SELECT read_at FROM notifications WHERE kind='sec07'")).rows).toEqual([{read_at:null}]);
    expect((await db.query('SELECT token FROM verification_token')).rows).toEqual([{token:'active'}]);
  });
  expect(Object.values(await cleanupPersonalData()).every(n=>n===0)).toBe(true);
});

it('a signed in person without a company can export and confirm immediate deletion',async()=>{
 const user=randomUUID();
 await withSystem(db=>db.query("INSERT INTO users(id,name,email) VALUES($1,'No company','no-company@example.test')",[user]));
 expect((await exportPersonalData(user)).companies).toEqual([]);
 await expect(requestMyAccountDeletion(user,{confirm:false})).rejects.toThrow();
 expect(await requestMyAccountDeletion(user,{confirm:true})).toMatchObject({completed:true,practice:false});
 expect((await withSystem(db=>db.query('SELECT email,name FROM users WHERE id=$1',[user]))).rows[0]).toEqual({email:null,name:'Deleted person'});
});
it('deletion leaves unrelated company audit snapshots untouched and rejects a restored stale session',async()=>{
 const audit=randomUUID();
 await withSystem(db=>db.query("INSERT INTO audit_log(id,workspace_id,action,entity,entity_id,\"after\") VALUES($1,$2,'update','clients',$3,$4)",[audit,ids.summit,randomUUID(),{contact_name:'Ravi',email:'unrelated@example.test'}]));
 await requestAccountDeletion(ids.ravi,ws,{confirm:true});await handleAccountDeletion(ids.imran,ws,ids.ravi,{confirm:true});
 await withSystem(async db=>{
   expect((await db.query('SELECT \"after\" FROM audit_log WHERE id=$1',[audit])).rows[0].after).toEqual({contact_name:'Ravi',email:'unrelated@example.test'});
   await db.query("INSERT INTO sessions(\"userId\",\"sessionToken\",expires) VALUES($1,'stale-sec07',now()+interval '1 hour')",[ids.ravi]);
 });
 expect(await getSessionUserId(new Request('http://localhost',{headers:{cookie:'authjs.session-token=stale-sec07'}}))).toBeNull();
});
it('company exports contain business visits, import records and base64 attachments, exclude personal photo drafts',async()=>{
 const jobPhoto=randomUUID(),draft=randomUUID();
 await withSystem(async db=>{
   await db.query("INSERT INTO job_photos(id,workspace_id,client_id,work_order_id,kind,mime,bytes,width,height,taken_by) SELECT $2,workspace_id,client_id,id,'before','image/jpeg',decode(repeat('61',100),'hex'),10,10,$3 FROM work_orders WHERE id=$1",[orderId(1),jobPhoto,ids.ravi]);
   await db.query("INSERT INTO shared_photos(id,workspace_id,uploaded_by,mime,bytes,width,height) VALUES($1,$2,$3,'image/jpeg',decode(repeat('62',100),'hex'),10,10)",[draft,ws,ids.ravi]);
 });
 const data=await exportCompanyData(ids.imran,ws);
 expect(data.records.job_visits).toBeDefined();expect(data.records.imports).toBeDefined();
 const photo=(data.records.job_photos as {bytes_base64:string}[])[0];
 expect(Buffer.from(photo.bytes_base64,'base64')).toEqual(Buffer.alloc(100,'a'));
 expect(JSON.stringify(data.records)).not.toContain(draft);
});
