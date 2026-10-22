import { afterAll,beforeEach,expect,it } from 'vitest';
import { closePools,ownerPool,withSystem,withUser } from '../lib/db';
import { getSessionUserId,setAuthResolverForTests,sessionCookie,authAdapter } from '../lib/auth';
import { seed,ids } from '../scripts/seed';
import { cleanupDemo, DEMO_NEW_PER_IP_HOUR } from '../lib/services/demo';
import { createInvite } from '../lib/services/invites';
import { repair } from '../lib/services/supplier';
import * as start from '../app/api/demo/start/route';
import * as switchRoute from '../app/api/demo/switch/route';
import * as reset from '../app/api/demo/reset/route';
import * as isolation from '../app/api/demo/isolation-check/route';
import * as cron from '../app/api/cron/demo-cleanup/route';
import * as workspaces from '../app/api/workspaces/route';
import * as workspace from '../app/api/workspaces/[ws]/route';
import * as members from '../app/api/workspaces/[ws]/members/[userId]/route';
import * as accept from '../app/api/invites/accept/route';
import type { RouteContext } from '../lib/api';
type Handler=(req:Request,ctx?:RouteContext)=>Promise<Response>;
const priorCap=process.env.DEMO_MAX_SANDBOXES,priorCron=process.env.CRON_SECRET;
beforeEach(async()=>{setAuthResolverForTests();delete process.env.DEMO_MAX_SANDBOXES;process.env.CRON_SECRET='demo-test-cron';const db=await ownerPool.connect();try{await seed(db);await db.query('TRUNCATE demo_creation_attempts');}finally{db.release();}});
afterAll(async()=>{setAuthResolverForTests();if(priorCap===undefined)delete process.env.DEMO_MAX_SANDBOXES;else process.env.DEMO_MAX_SANDBOXES=priorCap;if(priorCron===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=priorCron;await closePools();});
async function call(handler:Handler,body?:unknown,cookie?:string,params:Record<string,string>={},headers:Record<string,string>={}){
 const req=new Request('http://localhost/api',{method:body===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const response=await handler(req,{params:Promise.resolve(params)});
 return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')??'',request:req};
}
async function sandbox(persona='imran'){const r=await call(start.POST,{persona});expect(r.status).toBe(201);return r;}
async function identity(cookie:string){const id=await getSessionUserId(new Request('http://localhost',{headers:{cookie}}));expect(id).toBeTruthy();return id!;}
const count=async(table:string,ws:string)=>withSystem(async db=>(await db.query(`SELECT count(*)::int AS n FROM ${table} WHERE workspace_id=$1`,[ws])).rows[0].n);
it('start creates the shared fixture in one sandbox and an Auth.js database cookie for the selected persona',async()=>{
 const r=await sandbox('pranav'),ws=r.body.workspace_id,user=await identity(r.cookie);
 expect(r.cookie).toContain(sessionCookie.name+'=');expect(r.cookie).toContain('HttpOnly');expect(r.cookie).toContain('SameSite=Lax');expect(r.cookie).toContain('Path=/');
 const token=r.cookie.split(';')[0].split('=')[1];const lookup=await authAdapter.getSessionAndUser!(token);expect(lookup?.user.name).toBe('Pranav');expect(lookup?.user.id).toBe(user);expect(new Date(lookup!.session.expires).getTime()).toBeLessThanOrEqual(new Date(r.body.expires_at).getTime());
 for(const [table,n] of [['clients',3],['sites',6],['work_orders',66],['comments',37],['members',10],['supplier_orders',4],['cobalt_orders',4],['import_rows',1]] as const)expect(await count(table,ws)).toBe(n);
 expect(await count('notifications',ws)).toBeGreaterThanOrEqual(3);
 expect(await withSystem(async db=>(await db.query('SELECT count(*)::int AS n FROM accounts a JOIN users u ON u.id=a."userId" WHERE u.demo_workspace_id=$1',[ws])).rows[0].n)).toBe(0);
 expect((await call(workspaces.GET,undefined,r.cookie)).body).toHaveLength(1);
 expect(await withUser(user,async db=>(await db.query("SELECT id FROM comments WHERE visibility='internal'")).rows)).toEqual([]);
});
it('two visitors and real accounts are isolated through app-role RLS',async()=>{
 const a=await sandbox(),b=await sandbox(),u=await identity(a.cookie),v=await identity(b.cookie);
 expect(a.body.workspace_id).not.toBe(b.body.workspace_id);
 for(const [user,ws] of [[u,b.body.workspace_id],[v,a.body.workspace_id],[ids.imran,a.body.workspace_id],[ids.summitAdmin,a.body.workspace_id],[u,ids.ridgeline]])expect(await withUser(user,async db=>(await db.query('SELECT id FROM work_orders WHERE workspace_id=$1',[ws])).rows)).toEqual([]);
 for(const user of [ids.imran,ids.summitAdmin]){setAuthResolverForTests(async()=>user);const listed=await call(workspaces.GET);expect(listed.body.every((w:{is_demo:boolean})=>!w.is_demo)).toBe(true);}
});
it('switch rotates the session and keeps the sandbox; non-demo and anonymous sessions are rejected',async()=>{
 const a=await sandbox(),old=await identity(a.cookie);const switched=await call(switchRoute.POST,{persona:'pranav'},a.cookie);
 expect(switched.status).toBe(200);expect(switched.body.workspace_id).toBe(a.body.workspace_id);expect(await identity(switched.cookie)).not.toBe(old);expect(await getSessionUserId(new Request('http://localhost',{headers:{cookie:a.cookie}}))).toBeNull();
 expect((await call(switchRoute.POST,{persona:'imran'})).status).toBe(401);setAuthResolverForTests(async()=>ids.imran);expect((await call(switchRoute.POST,{persona:'sam'})).status).toBe(404);
});
it('reset requires confirm, replaces fixture mutations, keeps persona and extends expiry',async()=>{
 const a=await sandbox('sam');const user=await identity(a.cookie);await withUser(user,db=>db.query("UPDATE users SET name='Changed profile' WHERE id=$1",[user]));expect((await call(reset.POST,{},a.cookie)).status).toBe(422);
 await withUser(await identity(a.cookie),db=>db.query("UPDATE work_orders SET title='Changed' WHERE workspace_id=$1 AND status<>'done'",[a.body.workspace_id]));
 await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()+interval '10 minutes' WHERE id=$1",[a.body.workspace_id]));
 const result=await call(reset.POST,{confirm:true},a.cookie);expect(result.status).toBe(200);expect(result.body.persona).toBe('sam');expect(result.body.workspace_id).not.toBe(a.body.workspace_id);expect(await count('work_orders',a.body.workspace_id)).toBe(0);expect(await count('work_orders',result.body.workspace_id)).toBe(66);
 expect(new Date(result.body.expires_at).getTime()-Date.now()).toBeGreaterThan(5*3600000);expect((await call(isolation.GET,undefined,result.cookie)).body.role).toBe('staff');
});
it('Pranav isolation evidence uses real app role and Northgate exists; staff see all clients but zero cross-workspace rows',async()=>{
 const a=await sandbox('pranav');const result=await call(isolation.GET,undefined,a.cookie);expect(result.status).toBe(200);expect(result.body.database_role).toEqual(expect.any(String));expect(result.body.database_role).not.toBe('postgres');expect(result.body).toMatchObject({role:'client',client:'Harbor & Pine Coworking',row_count:0,cross_workspace:{row_count:0}});
 expect(result.body.query).toContain('$2');expect(result.body.params).toHaveLength(2);
 expect(await withSystem(async db=>(await db.query(result.body.query,result.body.params)).rowCount)).toBe(26);
 expect(await withUser(await identity(a.cookie),async db=>(await db.query('SELECT current_user AS role')).rows[0].role)).toBe(process.env.APP_DB_ROLE??'portal_app');
 const staff=await call(switchRoute.POST,{persona:'sam'},a.cookie);const check=await call(isolation.GET,undefined,staff.cookie);expect(check.body.row_count).toBe(26);expect(check.body.explanation).toContain('all clients');expect(check.body.cross_workspace.row_count).toBe(0);
});
it('demo fixture dropped supplier delivery can be detected and repaired idempotently',async()=>{
 const a=await sandbox();const result=await repair(await identity(a.cookie),a.body.workspace_id,{});expect(result.repaired).toBe(1);expect((await repair(await identity(a.cookie),a.body.workspace_id,{})).repaired).toBe(0);
});
it('cleanup removes expired sandboxes and all demo users/sessions only, and is idempotent',async()=>{
 const a=await sandbox(),b=await sandbox();await withSystem(db=>db.query("UPDATE workspaces SET demo_expires_at=now()-interval '1 second' WHERE id=$1",[a.body.workspace_id]));
 expect(await getSessionUserId(new Request('http://localhost',{headers:{cookie:a.cookie}}))).toBeNull();
 expect(await cleanupDemo()).toMatchObject({workspaces:1,users:10,sessions:1});expect(await cleanupDemo()).toMatchObject({workspaces:0,users:0,sessions:0});expect(await count('work_orders',b.body.workspace_id)).toBe(66);expect(await count('work_orders',ids.ridgeline)).toBe(60);
 expect(await withSystem(async db=>(await db.query('SELECT id FROM users WHERE demo_workspace_id=$1',[a.body.workspace_id])).rows)).toEqual([]);expect(await count('audit_log',a.body.workspace_id)).toBe(0);
});
it('demo users cannot accept real invites, create/delete workspaces or manage members; database rejects mixed memberships and Google accounts',async()=>{
 const a=await sandbox(),user=await identity(a.cookie);const email=await withSystem(async db=>(await db.query('SELECT email FROM users WHERE id=$1',[user])).rows[0].email);
 await expect(createInvite(ids.imran,ids.ridgeline,{email,role:'staff'})).rejects.toMatchObject({status:422});
 await expect(withSystem(db=>db.query("INSERT INTO invites(workspace_id,email,role,token_hash,expires_at) VALUES($1,$2,'staff','demo-invite-test',now()+interval '1 day')",[ids.ridgeline,email]))).rejects.toMatchObject({code:'P0404'});
 const invite=await createInvite(ids.imran,ids.ridgeline,{email:'real-invitee@example.test',role:'staff'});
 expect((await call(accept.POST,{token:invite.token},a.cookie)).status).toBe(403);
 expect((await call(workspaces.POST,{name:'Escape'},a.cookie)).status).toBe(403);
 expect((await call(workspace.DELETE,{confirm_name:'Ridgeline Facility Services'},a.cookie,{ws:a.body.workspace_id})).status).toBe(403);
 expect((await call(members.PATCH,{role:'staff'},a.cookie,{ws:a.body.workspace_id,userId:user})).status).toBe(403);
 for(const [ws,u] of [[ids.ridgeline,user],[a.body.workspace_id,ids.imran]])await expect(withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[ws,u]))).rejects.toMatchObject({code:'P0404'});
 await expect(withSystem(db=>db.query('INSERT INTO accounts("userId",type,provider,"providerAccountId") VALUES($1,$2,$3,$4)',[user,'oauth','google','demo-provider-id']))).rejects.toMatchObject({code:'P0404'});
 await expect(withUser(user,db=>db.query("SELECT create_workspace('Escape','Asia/Dubai')"))).rejects.toMatchObject({code:'P0403'});
 await expect(withUser(user,db=>db.query('SELECT accept_invite($1)',[invite.token]))).rejects.toMatchObject({code:'P0403'});
});
it('only abusive volumes of new sandboxes get a plain 429; at the global cap the oldest sandbox is recycled instead',async()=>{
 await withSystem(db=>db.query("INSERT INTO demo_creation_attempts(ip_hash) SELECT 'x' FROM generate_series(1,1)"));
 const ipHash=await withSystem(async db=>{const r=await sandbox();return (await db.query('SELECT ip_hash FROM demo_creation_attempts ORDER BY created_at DESC LIMIT 1')).rows[0].ip_hash;});
 await withSystem(db=>db.query('INSERT INTO demo_creation_attempts(ip_hash) SELECT $1 FROM generate_series(1,$2::int)',[ipHash,DEMO_NEW_PER_IP_HOUR]));
 const rate=await call(start.POST,{persona:'imran'});expect(rate.status).toBe(429);expect(rate.body.error.message).toContain('try again');
 await withSystem(db=>db.query('TRUNCATE demo_creation_attempts'));process.env.DEMO_MAX_SANDBOXES='2';
 expect((await call(start.POST,{persona:'imran'})).status).toBe(201);expect((await call(start.POST,{persona:'sam'})).status).toBe(201);
 expect(await withSystem(async db=>(await db.query('SELECT count(*)::int n FROM workspaces WHERE is_demo AND demo_expires_at>now()')).rows[0].n)).toBeLessThanOrEqual(2);
});
it('cron GET/POST require constant-time bearer authentication; validation and creation failures stay plain',async()=>{
 expect((await call(cron.GET)).status).toBe(401);expect((await call(cron.POST,{},undefined,{}, {authorization:'Bearer wrong'})).status).toBe(401);expect((await call(cron.GET,undefined,undefined,{}, {authorization:'Bearer demo-test-cron'})).status).toBe(200);
 expect((await call(start.POST,{persona:'unknown'})).status).toBe(422);
});
it('a failed fixture creation rolls back workspace, identities, session and rate record with a retryable plain error',async()=>{
 await withSystem(async db=>{await db.query("CREATE FUNCTION fail_demo_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.is_demo THEN RAISE EXCEPTION 'private database failure'; END IF; RETURN NEW; END $$");await db.query('CREATE TRIGGER fail_demo_fixture BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION fail_demo_fixture()');});
 try{
 const response=await call(start.POST,{persona:'imran'});expect(response.status).toBe(503);expect(response.cookie).toBe('');expect(JSON.stringify(response.body)).not.toContain('private');
 expect(await withSystem(async db=>(await db.query('SELECT count(*)::int AS n FROM workspaces WHERE is_demo')).rows[0].n)).toBe(0);
 expect(await withSystem(async db=>(await db.query('SELECT count(*)::int AS n FROM demo_creation_attempts')).rows[0].n)).toBe(0);
 }finally{await withSystem(async db=>{await db.query('DROP TRIGGER fail_demo_fixture ON users');await db.query('DROP FUNCTION fail_demo_fixture()');});}
 await sandbox();
});
it('concurrent creation respects the global cap and demo identities cannot join another sandbox',async()=>{
 process.env.DEMO_MAX_SANDBOXES='1';const results=await Promise.all([call(start.POST,{persona:'imran'}),call(start.POST,{persona:'sam'})]);expect(results.map(r=>r.status).sort()).toEqual([201,201]);expect(await withSystem(async db=>(await db.query('SELECT count(*)::int n FROM workspaces WHERE is_demo AND demo_expires_at>now()')).rows[0].n)).toBe(1);
 process.env.DEMO_MAX_SANDBOXES='2';const other=await sandbox();const liveWs=await withSystem(async db=>(await db.query('SELECT id FROM workspaces WHERE is_demo AND demo_expires_at>now() AND id<>$1',[other.body.workspace_id])).rows[0].id);const user=await identity(results.find(r=>r.body.workspace_id===liveWs)!.cookie);
 await expect(withSystem(db=>db.query("INSERT INTO members(workspace_id,user_id,role) VALUES($1,$2,'staff')",[other.body.workspace_id,user]))).rejects.toMatchObject({code:'P0404'});
 await expect(withUser(user,db=>db.query('SELECT delete_demo_workspace($1)',[other.body.workspace_id]))).rejects.toMatchObject({code:'42501'});
 await expect(withUser(user,db=>db.query('SELECT delete_workspace_data($1)',[other.body.workspace_id]))).rejects.toMatchObject({code:'42501'});
});
