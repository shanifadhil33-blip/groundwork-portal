import { contactRows } from './contact-names';
import { personalNames } from '../contact-names';
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withUser } from '../db';
import { ApiError, forbidden, missing } from '../http';
import { ROLES } from '../roles';
export const uuid = z.uuid();
export const name = z.string().trim().min(1).max(200);
export const role = z.enum(ROLES);
export const status = z.enum(['open','scheduled','in_progress','waiting_on_parts','done','cancelled']);
export const priority = z.enum(['low','normal','high','urgent']);
export type Context = { db: PoolClient; user: string; ws: string; role: string; client_id: string | null; staff_kind?: string | null; client_kind?: string | null };
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export async function inWorkspace<T>(user: string, ws: string, fn: (ctx: Context) => Promise<T>) {
  uuid.parse(ws);
  return withUser(user, async db => {
    const m = (await db.query('SELECT my_role($1) AS role,my_client($1) AS client_id,my_staff_kind($1) AS staff_kind,my_client_kind($1) AS client_kind',[ws])).rows[0];
    if (!m.role) throw missing();
    const result=await fn({db,user,ws,...m});
    if(result && typeof result === 'object') return personalNames(result,await contactRows(db,user,ws));
    return result;
  });
}
/** Office staff (ROLE08) run jobs, not the team: only admins and supervisors assign, change the team or decide leave. */
/** ROLE09: only the client facility manager approves prices and confirms visits. Facility staff and households raise and follow requests. */
export function allowClientManager(ctx: Context) { if (ctx.role !== 'client' || (ctx.client_kind ?? 'manager') !== 'manager') throw new ApiError(403, 'forbidden', 'Your facility manager answers prices and visit times. You can add a message on the request.'); }
export const isOfficeStaff = (ctx: Context) => ctx.role === 'staff' && ctx.staff_kind === 'office';
export function allowTeam(ctx: Context) { if (!['admin', 'staff'].includes(ctx.role) || isOfficeStaff(ctx)) throw new ApiError(403, 'forbidden', 'Only an admin or supervisor can change the team, give jobs to people or decide leave.'); }
export function allow(ctx: Context, roles: string[]) { if (!roles.includes(ctx.role)) throw forbidden(); }
export async function row(ctx: Context, table: 'workspaces'|'clients'|'sites'|'work_orders'|'invites'|'members', id: string, lock=false) {
  uuid.parse(id);
  const key=table==='members'?'user_id':'id';
  const sql=table==='workspaces'?'id=$1':`workspace_id=$1 AND ${key}=$2`;
  const result=await ctx.db.query(`SELECT * FROM ${table} WHERE ${sql}${lock?' FOR UPDATE':''}`,table==='workspaces'?[ctx.ws]:[ctx.ws,id]);
  if (!result.rows[0]) throw missing();
  return result.rows[0];
}
export async function replay<T>(db: PoolClient,user: string,scope: string,key: string|undefined,body: unknown,fn:()=>Promise<T>):Promise<T> {
  if (key === undefined) return fn();
  z.string().min(1).max(200).parse(key);
  const fingerprint=hash(JSON.stringify(body));
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify([user,scope,key])]);
  const stored=(await db.query('SELECT fingerprint,result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key=$3',[user,scope,key])).rows[0];
  if (stored) {
    if (stored.fingerprint!==fingerprint) throw new ApiError(409,'conflict','This request key was already used for different changes.');
    return stored.result as T;
  }
  const result=await fn();
  await db.query('INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5)',[user,scope,key,fingerprint,JSON.stringify(result)]);
  // Normalize first response to the same JSON representation as subsequent responses.
  return JSON.parse(JSON.stringify(result)) as T;
}
export async function insert(ctx: Context,table: 'clients'|'sites'|'work_orders'|'comments'|'invites',data: Record<string,unknown>) {
 const keys=Object.keys(data);
 return (await ctx.db.query(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(data))).rows[0];
}
export async function update(ctx: Context,table: 'workspaces'|'clients'|'sites'|'members'|'work_orders',id:string,data:Record<string,unknown>) {
 const keys=Object.keys(data);
 const key=table==='members'?'user_id':'id';
 const values=[...Object.values(data),id,...(table==='workspaces'?[]:[ctx.ws])];
 return (await ctx.db.query(`UPDATE ${table} SET ${keys.map((k,i)=>k+'=$'+(i+1)).join(',')} WHERE ${key}=$${keys.length+1}${table==='workspaces'?'': ' AND workspace_id=$'+(keys.length+2)} RETURNING *`,values)).rows[0];
}
