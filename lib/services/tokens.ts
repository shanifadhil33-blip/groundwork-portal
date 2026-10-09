import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { appPool } from '../db';
import { ApiError, missing } from '../http';
import { hash, inWorkspace, uuid } from './shared';
const fields='id,workspace_id,user_id,name,token_prefix,scope,created_at,expires_at,last_used_at,revoked_at';
export async function createToken(user:string,ws:string,body:unknown) {
 const d=z.object({name:z.string().trim().min(1).max(80),scope:z.enum(['read','write']),expires_in_days:z.number().int().min(1).max(365).optional()}).strict().parse(body);
 const token='gw_'+randomBytes(32).toString('base64url');
 return inWorkspace(user,ws,async c=>{
  const result=(await c.db.query(`INSERT INTO api_tokens(workspace_id,user_id,name,token_prefix,token_hash,scope,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING ${fields}`,[ws,user,d.name,token.slice(0,11),hash(token),d.scope,d.expires_in_days?new Date(Date.now()+d.expires_in_days*86400000):null])).rows[0];
  return {...result,token};
 });
}
export function listTokens(user:string,ws:string,params:URLSearchParams) {
 const {all}=z.object({all:z.enum(['true','false']).optional()}).strict().parse(Object.fromEntries(params));
 return inWorkspace(user,ws,async c=>(await c.db.query(`SELECT ${fields} FROM api_tokens WHERE workspace_id=$1 AND ($3::boolean OR user_id=$2) ORDER BY created_at DESC`,[ws,user,all==='true'&&c.role==='admin'])).rows);
}
export function revokeToken(user:string,ws:string,id:string) {
 uuid.parse(id);
 return inWorkspace(user,ws,async c=>{const t=(await c.db.query('SELECT id FROM api_tokens WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];if(!t)throw missing();return (await c.db.query(`UPDATE api_tokens SET revoked_at=coalesce(revoked_at,now()) WHERE workspace_id=$1 AND id=$2 RETURNING ${fields}`,[ws,id])).rows[0];});
}
export type TokenIdentity={id:string;user_id:string;workspace_id:string;scope:'read'|'write';name:string};
export async function verifyToken(req:Request):Promise<TokenIdentity> {
 const bearer=req.headers.get('authorization')?.match(/^Bearer (gw_[A-Za-z0-9_-]{43,})$/i)?.[1];
 if(!bearer||bearer.length>256)throw new ApiError(401,'unauthenticated','Invalid or expired token.');
 const result=(await appPool.query('SELECT * FROM verify_api_token($1)',[hash(bearer)])).rows[0];
 if(!result)throw new ApiError(401,'unauthenticated','Invalid or expired token.');
 return result;
}
