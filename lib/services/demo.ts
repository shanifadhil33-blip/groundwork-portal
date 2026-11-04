import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSystem, withUser } from '../db';
import { ApiError, missing } from '../http';
import { requiredEnv } from '../env';
import { populateFixture,ids as fixtureIds } from '../fixture';
import { sessionCookie } from '../auth';
import { DUNE_HARBOUR_NAME, DUNE_PERSONAS, populateDuneHarbour } from '../fixture-dune-harbour';
import { overdueSql } from '../dates';
import { companyHistory, type CompanyHistory } from './company-history';
import { LANGUAGES } from '../languages';
const RIDGELINE_PERSONAS=['imran','hassan','sam','ravi','pranav','omar','nabil','kevin','faisal'] as const;
const RIDGELINE_NAME='Ridgeline Facility Services';
type Company='ridgeline'|'dune_harbour';
type Persona=string;
/** DEMO20: Dune Harbour is hidden from judges. It is built only where DEMO_DUNE_HARBOUR=1 is set (test database first), never in production until Adhil says so. */
export const duneHarbourEnabled=()=>process.env.DEMO_DUNE_HARBOUR==='1';
const companyName=(c:Company)=>c==='dune_harbour'?DUNE_HARBOUR_NAME:RIDGELINE_NAME;
const companyOf=(name:string):Company=>name===DUNE_HARBOUR_NAME?'dune_harbour':'ridgeline';
function parsePersona(body:unknown,company?:Company){
 const raw=z.object({persona:z.string().max(40),company:z.enum(['ridgeline','dune_harbour']).optional(),language:z.string().refine(l=>LANGUAGES.some(v=>v.code===l)).optional()}).strict().parse(body);
 const c=company??raw.company??'ridgeline';
 if(c==='dune_harbour'&&!duneHarbourEnabled())throw missing();
 const persona=(c==='dune_harbour'?z.enum(DUNE_PERSONAS):z.enum(RIDGELINE_PERSONAS)).parse(raw.persona);
 return {persona,company:c,language:raw.language};
}
const lock=async(db:PoolClient)=>{await db.query('SELECT pg_advisory_xact_lock(78201350)');};
async function cleanup(db:PoolClient,limit:number){
 const rows=(await db.query('SELECT id FROM workspaces WHERE is_demo AND demo_expires_at<=now() ORDER BY demo_expires_at LIMIT $1 FOR UPDATE',[limit])).rows;
 const ids=rows.map(r=>r.id);
 const sessions=(await db.query('SELECT count(*)::int AS n FROM sessions s JOIN users u ON u.id=s."userId" WHERE u.demo_workspace_id=ANY($1::uuid[])',[ids])).rows[0].n;
 const users=(await db.query('SELECT coalesce(sum(delete_demo_workspace(id)),0)::int AS n FROM unnest($1::uuid[]) AS expired(id)',[ids])).rows[0].n;
 await db.query("DELETE FROM demo_creation_attempts WHERE created_at<now()-interval '1 hour'");
 return {workspaces:rows.length,users,sessions};
}
export async function cleanupDemo(limit=1000){return withSystem(async db=>{await lock(db);return cleanup(db,limit);});}
async function session(db:PoolClient,user:string,expires:Date,language?:string){
 if(language)await db.query('INSERT INTO user_preferences(user_id,language) VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET language=EXCLUDED.language',[user,language]);
 const token=randomBytes(32).toString('base64url');
 await db.query('INSERT INTO sessions("userId","sessionToken",expires) VALUES($1,$2,$3)',[user,token,expires]);
 const cookie=`${sessionCookie.name}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires.toUTCString()}${sessionCookie.options.secure?'; Secure':''}`;
 return cookie;
}
async function create(db:PoolClient,persona:Persona,company:Company='ridgeline',language?:string){
 if(company==='dune_harbour'){
  const ws=randomUUID();const made=await populateDuneHarbour(db,ws);
  const expires=(await db.query('SELECT demo_expires_at FROM workspaces WHERE id=$1',[ws])).rows[0].demo_expires_at as Date;
  return {body:{workspace_id:ws,persona,company,expires_at:expires},cookie:await session(db,made.ids[persona],expires,language)};
 }
 const ids=Object.fromEntries(Object.keys(fixtureIds).map(k=>[k,randomUUID()])) as typeof fixtureIds;
 const expires=(await db.query("INSERT INTO workspaces(id,name,is_demo,demo_expires_at) VALUES($1,'Ridgeline Facility Services',true,now()+interval '6 hours') RETURNING demo_expires_at",[ids.ridgeline])).rows[0].demo_expires_at as Date;
 const sites=Array.from({length:6},()=>randomUUID()),orders=Array.from({length:60},()=>randomUUID());
 await populateFixture(db,ids,n=>sites[n-1],n=>orders[n-1],true);
 // DEMO11: a separate admin without ownership, created only in this visitor's sandbox.
 const hassan=randomUUID();
 await db.query("INSERT INTO users(id,name,email,is_demo,demo_workspace_id,demo_persona) VALUES($1,'Hassan',$2,true,$3,'hassan')",[hassan,`hassan.${ids.ridgeline}@demo.groundwork.invalid`,ids.ridgeline]);
 await db.query("INSERT INTO members(workspace_id,user_id,role,is_owner) VALUES($1,$2,'admin',false)",[ids.ridgeline,hassan]);
 // Storage: seed noise in the audit log (bell and timeline rows) is about half of each sandbox. Keep the job, comment and team history.
 await db.query("DELETE FROM audit_log WHERE workspace_id=$1 AND entity IN ('notifications','work_order_events')",[ids.ridgeline]);
 return {body:{workspace_id:ids.ridgeline,persona,expires_at:expires},cookie:await session(db,persona==='hassan'?hassan:ids[persona as keyof typeof ids],expires,language)};
}
/** Signed pointer to the visitor's own sandbox, so signing in again (any person, many times) reuses it instead of building a new one. */
const sandboxSig=(ws:string)=>createHmac('sha256',requiredEnv('AUTH_SECRET')).update('sandbox:'+ws).digest('base64url');
export const sandboxToken=(ws:string)=>`${ws}.${sandboxSig(ws)}`;
export const sandboxCookie=(ws:string)=>'groundwork-sandbox='+sandboxToken(ws)+'; Path=/api/demo; HttpOnly; SameSite=Lax; Max-Age=86400'+(process.env.VERCEL?'; Secure':'');
function sandboxFromToken(token?:string|null){
 if(!token)return null;const [ws,sig]=token.split('.');
 return ws&&sig&&/^[0-9a-f-]{36}$/.test(ws)&&sig===sandboxSig(ws)?ws:null;
}
// Generous: judges sign in and out many times. Only abusive volumes of NEW sandboxes are refused.
export const DEMO_NEW_PER_IP_HOUR=40;
export async function startDemo(body:unknown,ip:string,sandbox?:string|null){
 const {persona,company,language}=parsePersona(body);
 const ipHash=createHmac('sha256',requiredEnv('AUTH_SECRET')).update('demo-ip:'+ip).digest('hex');
 const reuse=sandboxFromToken(sandbox);
 return withSystem(async db=>{
  await lock(db);await cleanup(db,10);
  if(reuse){
   const live=(await db.query('SELECT w.demo_expires_at,u.id FROM workspaces w JOIN users u ON u.demo_workspace_id=w.id AND u.is_demo AND u.demo_persona=$2 WHERE w.id=$1 AND w.is_demo AND w.demo_expires_at>now() AND w.name=$3',[reuse,persona,companyName(company)])).rows[0];
   if(live)return {body:{workspace_id:reuse,persona,expires_at:live.demo_expires_at},cookie:await session(db,live.id,live.demo_expires_at,language)};
  }
  const count=(await db.query("SELECT count(*)::int AS n FROM demo_creation_attempts WHERE ip_hash=$1 AND created_at>now()-interval '1 hour'",[ipHash])).rows[0].n;
  if(count>=DEMO_NEW_PER_IP_HOUR)throw new ApiError(429,'demo_limit','The demo is busy. Please try again later.');
  const configured=Number(process.env.DEMO_MAX_SANDBOXES??200);const cap=Number.isSafeInteger(configured)&&configured>0?configured:200;
  // At the cap, recycle the oldest sandboxes (earliest to expire) instead of turning anyone away. Keep the newest, so someone who just started never loses his demo.
  const over=(await db.query('SELECT id FROM workspaces WHERE is_demo AND demo_expires_at>now() ORDER BY demo_expires_at DESC OFFSET $1',[cap-1])).rows;
  if(over.length)await db.query('SELECT delete_demo_workspace(id) FROM workspaces WHERE id=ANY($1::uuid[])',[over.map(r=>r.id)]);
  await db.query('INSERT INTO demo_creation_attempts(ip_hash) VALUES($1)',[ipHash]);
  return create(db,persona,company,language);
 });
}
async function context(db:PoolClient,user:string){
 const m=(await db.query("SELECT m.*,w.demo_expires_at,w.name AS workspace_name,u.demo_persona FROM users u JOIN members m ON m.user_id=u.id JOIN workspaces w ON w.id=m.workspace_id WHERE u.id=$1 AND u.is_demo AND w.is_demo AND w.demo_expires_at>now() FOR UPDATE OF w",[user])).rows[0];
 if(!m)throw missing();return m;
}
export async function assertRealUser(user:string){await withUser(user,db=>db.query('SELECT require_real_user()'));}
export async function switchDemo(user:string,body:unknown){
 return withSystem(async db=>{await lock(db);const m=await context(db,user);const {persona,language}=parsePersona(body,companyOf(m.workspace_name));
 const target=(await db.query('SELECT id FROM users WHERE demo_workspace_id=$1 AND is_demo AND demo_persona=$2',[m.workspace_id,persona])).rows[0];if(!target)throw missing();
 await db.query('DELETE FROM sessions WHERE "userId" IN (SELECT id FROM users WHERE demo_workspace_id=$1)',[m.workspace_id]);
 return {body:{workspace_id:m.workspace_id,persona,expires_at:m.demo_expires_at},cookie:await session(db,target.id,m.demo_expires_at,language)};
 });
}
export async function resetDemo(user:string,body:unknown){
 z.object({confirm:z.literal(true)}).strict().parse(body);
 return withSystem(async db=>{await lock(db);const m=await context(db,user);const persona=m.demo_persona as Persona;const company=companyOf(m.workspace_name);
 if(company==='dune_harbour'&&!duneHarbourEnabled())throw missing();
 const language=(await db.query('SELECT language FROM user_preferences WHERE user_id=$1',[user])).rows[0]?.language;
 await db.query('SELECT delete_demo_workspace($1)',[m.workspace_id]);return create(db,persona,company,language);});
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
 return {database_role,role:m.role,client,query,params,row_count,...(m.role==='client'?{}:{explanation:m.role==='technician'?'Technicians see only the clients and sites of jobs assigned to them.':'Supervisors and admins can see all clients in their sandbox.'}),cross_workspace:{query:crossQuery,params:[other],row_count:(await db.query(crossQuery,[other])).rowCount??0}};
 });
}
/** DEMO12: labelled demo control. Moves one open job of today (or the next one) to due yesterday so the late flow can be shown live.
 * Demo sandboxes only, office roles only; it changes one due date and nothing else. */
export async function makeJobLate(user:string){
 const m=await withSystem(db=>context(db,user));
 if(!['admin','supervisor','staff'].includes(m.role))throw new ApiError(403,'forbidden','Only the office can use this demo control.');
 return withUser(user,async db=>{
  const pick=(await db.query(`SELECT id,title FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled','in_progress') AND NOT (${overdueSql})
   ORDER BY (scheduled_for IS NULL), scheduled_for, order_number LIMIT 1`,[m.workspace_id])).rows[0];
  if(!pick)throw new ApiError(409,'nothing_to_move','Every open job is already late.');
  await db.query("UPDATE work_orders SET due_on=((CURRENT_TIMESTAMP AT TIME ZONE (SELECT timezone FROM workspaces WHERE id=$2))::date-1), updated_at=now() WHERE id=$1 AND workspace_id=$2",[pick.id,m.workspace_id]);
  return {work_order_id:pick.id as string,title:pick.title as string};
 });
}
/** DEMO12: labelled demo control "Demo: before and after learning". Demo sandboxes only, office only. Changes nothing:
 * it finds the open job with the most finished jobs behind its usual time, so the job page can show a new company (no
 * records, no estimate) next to this company's own history (LEARN10). */
export async function learningJob(user:string){
 const m=await withSystem(db=>context(db,user));
 if(!['admin','supervisor','staff'].includes(m.role))throw new ApiError(403,'forbidden','Only the office can use this demo control.');
 const open=await withUser(user,async db=>(await db.query("SELECT id FROM work_orders WHERE workspace_id=$1 AND status IN ('open','scheduled') AND trade IS NOT NULL ORDER BY order_number",[m.workspace_id])).rows as {id:string}[]);
 let best:{work_order_id:string;after:CompanyHistory}|null=null;
 for(const j of open){const h=await companyHistory(user,m.workspace_id,j.id);if(h.typical_minutes!==null&&(!best||h.based_on>best.after.based_on))best={work_order_id:j.id,after:h};}
 if(!best)throw new ApiError(409,'nothing_learned','No open job has enough finished jobs behind it yet.');
 return {...best,before:{based_on:0,typical_minutes:null}};
}
