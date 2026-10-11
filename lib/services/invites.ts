import { assertRealUser } from './demo';
import { createHmac, randomUUID } from 'node:crypto';
import { requiredEnv } from '../env';
import { z } from 'zod';
import { withUser } from '../db';
import { ApiError, invalid, missing } from '../http';
import { membershipSchema } from './members';
import { allow, hash, inWorkspace, insert, replay, row } from './shared';
const inviteToken=(id:string)=>createHmac('sha256',requiredEnv('AUTH_SECRET')).update('invite:'+id).digest('base64url');
const schema=membershipSchema.safeExtend({email:z.email().max(320)});
const publicColumns='id,workspace_id,client_id,email,role,CASE WHEN status=\'pending\' AND expires_at<=now() THEN \'expired\' ELSE status END AS status,expires_at,created_at,accepted_by';
export async function listInvites(user:string,ws:string) {
 return inWorkspace(user,ws,async c=>{allow(c,['admin','staff']);return (await c.db.query(`SELECT ${publicColumns} FROM invites WHERE workspace_id=$1 ORDER BY created_at DESC,id`,[ws])).rows;});
}
export async function createInvite(user:string,ws:string,body:unknown,key?:string) {
 await assertRealUser(user);
 return inWorkspace(user,ws,async c=>{
  allow(c,['admin']);const data=schema.parse(body);
  if(data.email.toLowerCase().endsWith('@demo.groundwork.invalid'))throw invalid('Demo identities cannot be invited to a workspace.','email');
  if(data.client_id)await row(c,'clients',data.client_id);
  // Only the hash is stored; replay reconstructs the capability using the server secret.
  const result=await replay(c.db,user,ws+'/invites',key,data,async()=>{
   const id=randomUUID();
   const token=inviteToken(id);
   const invite=await insert(c,'invites',{id,workspace_id:ws,email:data.email.toLowerCase(),role:data.role,client_id:data.client_id??null,token_hash:hash(token),expires_at:new Date(Date.now()+7*86400000)});
   const {token_hash:_,...safe}=invite;
   return safe;
  });
  return {...result,token:inviteToken(result.id)};
 });
}
export async function revokeInvite(user:string,ws:string,id:string) {
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
