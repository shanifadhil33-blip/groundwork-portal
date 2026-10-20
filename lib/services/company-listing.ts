import { z } from 'zod';
import { withUser } from '../db';
import { ApiError } from '../http';
import { assertRealUser } from './demo';
import { inWorkspace, uuid } from './shared';
export async function searchCompanies(user:string,q:string){
 await assertRealUser(user);
 const search=z.string().trim().max(120).parse(q);
 return withUser(user,async db=>(await db.query('SELECT * FROM search_listed_companies($1)',[search])).rows);
}
export async function myJoinRequests(user:string){await assertRealUser(user);return withUser(user,async db=>(await db.query('SELECT * FROM my_company_requests()')).rows);}
const joinSchema=z.object({workspace_id:uuid,kind:z.enum(['household','manager']),name:z.string().trim().min(1).max(200),phone:z.string().trim().min(1).max(40),address:z.string().trim().max(2000).default(''),note:z.string().trim().max(300).default('')}).strict().refine(d=>d.kind!=='household'||!!d.address,{path:['address'],message:'Enter your home address.'});
export async function requestJoin(user:string,body:unknown){
 await assertRealUser(user);const d=joinSchema.parse(body);
 try{return await withUser(user,async db=>(await db.query('SELECT * FROM request_company_join($1,$2,$3,$4,$5,$6)',[d.workspace_id,d.kind,d.name,d.phone,d.address,d.note])).rows[0]);}
 catch(e){if((e as {code?:string}).code==='23505')throw new ApiError(409,'pending_request','You already have a pending request with this company.');throw e;}
}
export async function listJoinRequests(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 if(c.role!=='admin'&&!(c.role==='staff'&&c.staff_kind==='office'))throw new ApiError(403,'forbidden','Only an admin or office staff can answer requests to join.');
 return (await c.db.query('SELECT * FROM join_requests WHERE workspace_id=$1 ORDER BY created_at DESC',[ws])).rows;
});}
export async function decideJoinRequest(user:string,ws:string,id:string,body:unknown){
 await assertRealUser(user);uuid.parse(ws);uuid.parse(id);
 const d=z.object({status:z.enum(['accepted','declined'])}).strict().parse(body);
 return inWorkspace(user,ws,async c=>{
  if(c.role!=='admin'&&!(c.role==='staff'&&c.staff_kind==='office'))throw new ApiError(403,'forbidden','Only an admin or office staff can answer requests to join.');
  try{return (await c.db.query('SELECT * FROM decide_company_join($1,$2,$3)',[ws,id,d.status])).rows[0];}
  catch(e){if((e as {code?:string}).code==='P0409')throw new ApiError(409,'request_answered','This request has already been answered or this person already belongs to the company.');throw e;}
 });
}
export async function editHomeAddress(user:string,ws:string,site:string,body:unknown){
 await assertRealUser(user);uuid.parse(ws);uuid.parse(site);
 const d=z.object({address:z.string().trim().min(1,'Enter your home address.').max(2000)}).strict().parse(body);
 return inWorkspace(user,ws,async c=>{
  if(c.role!=='client'||c.client_kind!=='household')throw new ApiError(403,'forbidden','You can only change your own home address.');
  try{return (await c.db.query('SELECT * FROM edit_household_address($1,$2,$3)',[ws,site,d.address])).rows[0];}
  catch(e){if((e as {code?:string}).code==='P0403')throw new ApiError(403,'forbidden','You can only change your own home address.');throw e;}
 });
}

export async function readCompanyReplies(user:string){await assertRealUser(user);return withUser(user,async db=>{await db.query('SELECT read_company_replies()');return {read:true};});}
