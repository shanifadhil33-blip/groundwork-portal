import { practiceWorkspace, practiceInvites } from './identity-rehearsal';
import { PRACTICE_TOKEN, PRACTICE_EMAIL_HINT, practiceInviteScope } from '../identity-rehearsal';
import { assertRealUser } from './demo';
import { createHmac, randomUUID } from 'node:crypto';
import { requiredEnv } from '../env';
import { z } from 'zod';
import { withUser, withSystem } from '../db';
import { ApiError, invalid, missing } from '../http';
import { membershipSchema } from './members';
import { allow, hash, inWorkspace, insert, replay, row } from './shared';
const inviteToken=(id:string)=>createHmac('sha256',requiredEnv('AUTH_SECRET')).update('invite:'+id).digest('base64url');
const schema=membershipSchema.safeExtend({email:z.email().max(320),client_kind:z.enum(['manager','office','household']).default('manager')});
const publicColumns='id,workspace_id,client_id,client_kind,(SELECT name FROM clients WHERE clients.id=invites.client_id AND clients.workspace_id=invites.workspace_id) AS client_name,email,role,CASE WHEN status=\'pending\' AND expires_at<=now() THEN \'expired\' ELSE status END AS status,expires_at,created_at,accepted_by';
export async function listInvites(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);if(await practiceWorkspace(c))return practiceInvites(c);return (await c.db.query(`SELECT ${publicColumns} FROM invites WHERE workspace_id=$1 ORDER BY created_at DESC,id`,[ws])).rows;});
}
export async function createInvite(user:string,ws:string,body:unknown,key?:string) {
 const practice=await inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const w=await practiceWorkspace(c);if(!w)return null;
  const data=schema.parse(body);
  if(!/^[^@]+@[^@]+\.example$/i.test(data.email))throw invalid(PRACTICE_EMAIL_HINT,'email');
  const client=data.client_id?await row(c,'clients',data.client_id):null;
  return replay(c.db,user,ws+'/practice-invite-create',key,data,async()=>{
   const id=randomUUID();
   const result={id,workspace_id:ws,email:data.email.toLowerCase(),role:data.role,client_id:data.client_id??null,client_name:client?.name??null,client_kind:data.role==='client'?data.client_kind:'manager',status:'pending',...w,created_at:new Date().toISOString(),simulated:true,token:PRACTICE_TOKEN};
   await c.db.query('INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5)',[user,practiceInviteScope(ws),id,'preview',JSON.stringify(result)]);
   return result;
  });
 });
 if(practice)return practice;
 await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const data=schema.parse(body);
  if(data.email.toLowerCase().endsWith('@demo.groundwork.invalid'))throw invalid('Demo identities cannot be invited to a workspace.','email');
  if(data.client_id)await row(c,'clients',data.client_id);
  // Only the hash is stored; replay reconstructs the capability using the server secret.
  const result=await replay(c.db,user,ws+'/invites',key,data,async()=>{
   const id=randomUUID();
   const token=inviteToken(id);
   const invite=await insert(c,'invites',{id,workspace_id:ws,email:data.email.toLowerCase(),role:data.role,client_id:data.client_id??null,client_kind:data.role==='client'?data.client_kind:'manager',token_hash:hash(token),expires_at:new Date(Date.now()+7*86400000)});
   const {token_hash:_,...safe}=invite;
   return safe;
  });
  return {...result,token:inviteToken(result.id)};
 });
}
export async function revokeInvite(user:string,ws:string,id:string) {
 const practice=await inWorkspace(user,ws,async c=>{
  allow(c,['admin']);if(!await practiceWorkspace(c))return null;
  // The app role can read/insert receipts but cannot update them. Recheck the
  // caller and sandbox inside this attributed owner transaction, just as team
  // management does. Never substitute another app.user_id.
  return withSystem(async db=>{
   const receipt=(await db.query(`SELECT k.result FROM idempotency_keys k
    JOIN workspaces w ON w.id=$2 AND w.is_demo AND w.demo_expires_at>now()
    JOIN members m ON m.workspace_id=w.id AND m.user_id=$1 AND m.role='admin' AND m.archived_at IS NULL
    JOIN users u ON u.id=m.user_id AND u.is_demo AND u.demo_workspace_id=w.id
    WHERE k.user_id=$1 AND k.scope=$3 AND k.key=$4 FOR UPDATE OF k`,[user,ws,practiceInviteScope(ws),id])).rows[0]?.result;
   if(!receipt)throw missing();
   receipt.status='revoked';
   await db.query('UPDATE idempotency_keys SET result=$4 WHERE user_id=$1 AND scope=$2 AND key=$3',[user,practiceInviteScope(ws),id,JSON.stringify(receipt)]);
   return {id,status:'revoked',simulated:true};
  },user);
 });
 if(practice)return practice;
 await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const i=await row(c,'invites',id,true);
  if(i.status==='accepted')throw new ApiError(409,'conflict','This invite has already been accepted.');
  await c.db.query("UPDATE invites SET status=CASE WHEN status='pending' AND expires_at<=now() THEN 'expired' ELSE 'revoked' END WHERE workspace_id=$1 AND id=$2",[ws,id]);
  return {id,status:i.status==='pending' && i.expires_at<=new Date()?'expired':'revoked'};
 });
}
export async function acceptInvite(user:string,body:unknown,key?:string) {
 await assertRealUser(user);
 const data=z.object({token:z.string().min(32).max(200)}).strict().parse(body);
 const result=await withUser(user,db=>replay(db,user,'invites/accept',key,{token_hash:hash(data.token)},async()=>(await db.query('SELECT accept_invite($1) AS result',[hash(data.token)])).rows[0].result));
 if(result.error==='unauthenticated')throw new ApiError(401,'unauthenticated','Sign in to continue.');
 if(result.error==='not_found')throw missing();
 if(result.error)throw new ApiError(409,result.error==='expired'?'invite_expired':result.error==='accepted'?'invite_used':'invite_unavailable',result.error==='expired'?'This invite has expired.':'This invite is no longer available.');
 return result;
}

export async function inspectInvite(user:string,token:unknown) {
 const value=z.string().min(32).max(200).parse(token);
 const result=await withUser(user,async db=>(await db.query('SELECT inspect_invite($1) AS result',[hash(value)])).rows[0].result);
 if(result.error==='not_found')throw missing();
 if(result.error)throw new ApiError(409,result.error==='expired'?'invite_expired':result.error==='accepted'?'invite_used':'invite_unavailable','This invite is no longer available. Ask your admin for a new invite.');
 return result;
}
