import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError, forbidden, missing } from '../http';
import { practiceCompanyJoinScope } from '../company-join-rehearsal';
import { uuid } from './shared';

type PracticeContext={db:PoolClient;ws:string;user:string;role:string;staff_kind:string|null;client_kind:string|null;name:string;trades:string[]};
/** Owner access only to sandbox scratch records. Check and lock identity, live workspace and
 * active membership together, including when the office reads another sample person's receipt.
 * Never call public search or any real join, invite, account or onboarding procedure here. */
async function inPractice<T>(user:string,ws:string|null,fn:(c:PracticeContext)=>Promise<T>) {
 uuid.parse(user);if(ws)uuid.parse(ws);
 return withSystem(async db=>{
  const row=(await db.query(`SELECT w.id AS ws,w.name,w.trades,m.role,m.staff_kind,m.client_kind
   FROM users u JOIN workspaces w ON w.id=u.demo_workspace_id
   JOIN members m ON m.user_id=u.id AND m.workspace_id=w.id
   WHERE u.id=$1 AND u.is_demo AND w.is_demo AND w.demo_expires_at>now()
   AND m.archived_at IS NULL AND ($2::uuid IS NULL OR w.id=$2)
   FOR SHARE OF u,w,m`,[user,ws])).rows[0];
  if(!row)throw missing();
  return fn({db,user,...row});
 },user);
}
function household(c:PracticeContext) {
 if(c.role!=='client'||c.client_kind!=='household')throw forbidden();
}
function office(c:PracticeContext) {
 if(c.role!=='admin'&&!(c.role==='staff'&&c.staff_kind==='office'))throw new ApiError(403,'forbidden','Only an admin or office staff can answer requests to join.');
}
export async function searchPracticeCompanies(user:string,q:string) {
 const search=z.string().trim().max(120).parse(q).toLocaleLowerCase();
 return inPractice(user,null,async c=>{household(c);return search.length>=2&&c.name.toLocaleLowerCase().includes(search)?[{id:c.ws,name:c.name,listing_area:null,trades:c.trades}]:[];});
}
export async function practiceJoinDetails(user:string) {
 return inPractice(user,null,async c=>{household(c);return (await c.db.query('SELECT result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key=$3',[user,practiceCompanyJoinScope(c.ws),'details'])).rows[0]?.result??{name:'',phone:'',address:'',note:''};});
}
export async function myPracticeJoinRequests(user:string) {
 return inPractice(user,null,async c=>{household(c);return (await c.db.query('SELECT result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key<>$3 ORDER BY created_at DESC,key',[user,practiceCompanyJoinScope(c.ws),'details'])).rows.map(r=>r.result);});
}
const join=z.object({workspace_id:uuid,kind:z.enum(['household','manager']),name:z.string().trim().min(1).max(200),phone:z.literal('+971000000000'),address:z.string().trim().max(2000).default(''),note:z.string().trim().max(300).default('')}).strict().refine(d=>d.kind!=='household'||!!d.address,{path:['address'],message:'Enter your home address.'});
export async function requestPracticeJoin(user:string,body:unknown) {
 const d=join.parse(body);
 return inPractice(user,d.workspace_id,async c=>{
  household(c);
  // Serialize attempts by this requester, without changing a membership or a SQL constraint.
  await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`${practiceCompanyJoinScope(c.ws)}/${user}`]);
  const pending=(await c.db.query("SELECT 1 FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND result->>'status'='pending'",[user,practiceCompanyJoinScope(c.ws)])).rows[0];
  if(pending)throw new ApiError(409,'pending_request','You already have a pending request with this company.');
  const id=randomUUID(),result={...d,id,company_name:c.name,status:'pending',simulated:true,created_at:new Date().toISOString()};
  await c.db.query('INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5)',[user,practiceCompanyJoinScope(c.ws),id,'preview',JSON.stringify(result)]);
  return result;
 });
}
export async function listPracticeJoinRequests(user:string,ws:string) {
 return inPractice(user,ws,async c=>{
  office(c);
  return (await c.db.query(`SELECT k.result FROM idempotency_keys k JOIN users u ON u.id=k.user_id
   WHERE k.scope=$1 AND k.key<>$2 AND u.is_demo AND u.demo_workspace_id=$3 ORDER BY k.created_at DESC,k.key`,[practiceCompanyJoinScope(ws),'details',ws])).rows.map(r=>r.result);
 });
}
const decision=z.object({workspace_id:uuid,id:uuid,status:z.enum(['accepted','declined'])}).strict();
export async function decidePracticeJoinRequest(user:string,body:unknown) {
 const d=decision.parse(body);
 return inPractice(user,d.workspace_id,async c=>{
  office(c);
  // Row lock makes accept/decline a single decision even across office personas.
  const stored=(await c.db.query(`SELECT k.user_id,k.result FROM idempotency_keys k JOIN users u ON u.id=k.user_id
   JOIN members m ON m.user_id=u.id AND m.workspace_id=u.demo_workspace_id
   WHERE k.scope=$1 AND k.key=$2 AND u.is_demo AND u.demo_workspace_id=$3
   AND m.role='client' AND m.client_kind='household' AND m.archived_at IS NULL FOR UPDATE OF k`,[practiceCompanyJoinScope(c.ws),d.id,c.ws])).rows[0];
  if(!stored)throw missing();
  if(stored.result.status!=='pending')throw new ApiError(409,'request_answered','This request has already been answered or this person already belongs to the company.');
  const result={...stored.result,status:d.status,decided_by:user,decided_at:new Date().toISOString()};
  await c.db.query('UPDATE idempotency_keys SET result=$4 WHERE user_id=$1 AND scope=$2 AND key=$3',[stored.user_id,practiceCompanyJoinScope(c.ws),d.id,JSON.stringify(result)]);
  return result;
 });
}
