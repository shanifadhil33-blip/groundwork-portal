import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSystem, withUser } from '../db';
import { ApiError, missing } from '../http';
import { requiredEnv } from '../env';
import { populateFixture,ids as fixtureIds } from '../fixture';
import { sessionCookie } from '../auth';
export const personaSchema=z.object({persona:z.enum(['dana','sam','priya','omar'])}).strict();
type Persona=z.infer<typeof personaSchema>['persona'];
const lock=async(db:PoolClient)=>{await db.query('SELECT pg_advisory_xact_lock(78201350)');};
async function cleanup(db:PoolClient,limit:number){
 const rows=(await db.query('SELECT id FROM workspaces WHERE is_demo AND demo_expires_at<=now() ORDER BY demo_expires_at LIMIT $1 FOR UPDATE',[limit])).rows;
 const ids=rows.map(r=>r.id);
 const sessions=(await db.query('SELECT count(*)::int AS n FROM sessions s JOIN users u ON u.id=s."userId" WHERE u.demo_workspace_id=ANY($1::uuid[])',[ids])).rows[0].n;
 let users=0;for(const {id} of rows)users+=(await db.query('SELECT delete_demo_workspace($1) AS n',[id])).rows[0].n;
 await db.query("DELETE FROM demo_creation_attempts WHERE created_at<now()-interval '1 hour'");
 return {workspaces:rows.length,users,sessions};
}
export async function cleanupDemo(limit=1000){return withSystem(async db=>{await lock(db);return cleanup(db,limit);});}
async function session(db:PoolClient,user:string,expires:Date){
 const token=randomBytes(32).toString('base64url');
 await db.query('INSERT INTO sessions("userId","sessionToken",expires) VALUES($1,$2,$3)',[user,token,expires]);
 const cookie=`${sessionCookie.name}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${sessionCookie.options.secure?'; Secure':''}`;
 return cookie;
}
async function create(db:PoolClient,persona:Persona){
 const ids=Object.fromEntries(Object.keys(fixtureIds).map(k=>[k,randomUUID()])) as typeof fixtureIds;
 const expires=(await db.query("INSERT INTO workspaces(id,name,is_demo,demo_expires_at) VALUES($1,'Ridgeline Facility Services',true,now()+interval '24 hours') RETURNING demo_expires_at",[ids.ridgeline])).rows[0].demo_expires_at as Date;
 const sites=Array.from({length:6},()=>randomUUID()),orders=Array.from({length:60},()=>randomUUID());
 await populateFixture(db,ids,n=>sites[n-1],n=>orders[n-1],true);
 return {body:{workspace_id:ids.ridgeline,persona,expires_at:expires},cookie:await session(db,ids[persona],expires)};
}
export async function startDemo(body:unknown,ip:string){
 const {persona}=personaSchema.parse(body);
 const ipHash=createHmac('sha256',requiredEnv('AUTH_SECRET')).update('demo-ip:'+ip).digest('hex');
 return withSystem(async db=>{
  await lock(db);await cleanup(db,10);
  const count=(await db.query("SELECT count(*)::int AS n FROM demo_creation_attempts WHERE ip_hash=$1 AND created_at>now()-interval '1 hour'",[ipHash])).rows[0].n;
  const live=(await db.query('SELECT count(*)::int AS n FROM workspaces WHERE is_demo AND demo_expires_at>now()')).rows[0].n;
  const configured=Number(process.env.DEMO_MAX_SANDBOXES??200);const cap=Number.isSafeInteger(configured)&&configured>0?configured:200;
  if(count>=5||live>=cap)throw new ApiError(429,'demo_limit','The demo is busy. Please try again later.');
  await db.query('INSERT INTO demo_creation_attempts(ip_hash) VALUES($1)',[ipHash]);
  return create(db,persona);
 });
}
async function context(db:PoolClient,user:string){
 const m=(await db.query("SELECT m.*,w.demo_expires_at,u.demo_persona FROM users u JOIN members m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE u.id=$1 AND u.is_demo AND w.is_demo AND w.demo_expires_at>now() FOR UPDATE OF w",[user])).rows[0];
 if(!m)throw missing();return m;
}
export async function assertRealUser(user:string){await withUser(user,db=>db.query('SELECT require_real_user()'));}
export async function switchDemo(user:string,body:unknown){
 const {persona}=personaSchema.parse(body);
 return withSystem(async db=>{await lock(db);const m=await context(db,user);
 const target=(await db.query('SELECT id FROM users WHERE demo_workspace_id=$1 AND is_demo AND demo_persona=$2',[m.workspace_id,persona])).rows[0];if(!target)throw missing();
 await db.query('DELETE FROM sessions WHERE "userId" IN (SELECT id FROM users WHERE demo_workspace_id=$1)',[m.workspace_id]);
 return {body:{workspace_id:m.workspace_id,persona,expires_at:m.demo_expires_at},cookie:await session(db,target.id,m.demo_expires_at)};
 });
}
export async function resetDemo(user:string,body:unknown){
 z.object({confirm:z.literal(true)}).strict().parse(body);
 return withSystem(async db=>{await lock(db);const m=await context(db,user);const persona=m.demo_persona as Persona;
 await db.query('SELECT delete_demo_workspace($1)',[m.workspace_id]);return create(db,persona);});
}
export async function isolationCheck(user:string){
 // Owner lookup only establishes sandbox identity; both evidence queries run as app role.
 const m=await withSystem(db=>context(db,user));
 return withUser(user,async db=>{
 const client=(await db.query('SELECT name FROM clients WHERE id=$1',[m.client_id])).rows[0]?.name??null;
 // Northgate ID is metadata, not a work-order query through the owner connection.
 const northgate=await withSystem(async owner=>(await owner.query("SELECT id FROM clients WHERE workspace_id=$1 AND name='Northgate Self Storage'",[m.workspace_id])).rows[0].id);
 const query='SELECT id FROM work_orders WHERE workspace_id=$1 AND client_id=$2';
 const params=[m.workspace_id,northgate];const row_count=(await db.query(query,params)).rowCount??0;
 const other=await withSystem(async owner=>(await owner.query('SELECT id FROM workspaces WHERE id<>$1 ORDER BY id LIMIT 1',[m.workspace_id])).rows[0]?.id??randomUUID());
 const crossQuery='SELECT id FROM work_orders WHERE workspace_id=$1';
 const database_role=(await db.query('SELECT current_user AS name')).rows[0].name;
 return {database_role,role:m.role,client,query,params,row_count,...(m.role==='client'?{}:{explanation:'Staff and admins can see all clients in their sandbox.'}),cross_workspace:{query:crossQuery,params:[other],row_count:(await db.query(crossQuery,[other])).rowCount??0}};
 });
}
