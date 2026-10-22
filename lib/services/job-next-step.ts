import { assertPriceReleased } from './price-changes';
import { z } from 'zod';
import type { PoolClient } from 'pg';
import { asAgent, withSystem } from '../db';
import { ApiError, invalid } from '../http';
import { returnVisitLine, statusLine, type ReturnMessage } from '../status-updates';
import { inWorkspace, row, uuid, type Context } from './shared';
import { assertFreeVisit, slotsForJob } from './client-visits';

const input = z.object({ action:z.enum(['follow_up','part_arrived','no_access','book']), scheduled_for:z.iso.datetime({offset:true}).optional(), photo_id:uuid.optional() }).strict();
type Action = z.infer<typeof input>;
const denied=()=>new ApiError(403,'forbidden','You cannot make this change on this job.');
const labels={fixed:'Ask the client to sign off',temporary:'Book a follow up visit',needs_part:'Prepare a follow up visit',cant_fix:'The supervisor will call the client.'};
export async function reportNextNotice(db:PoolClient,ws:string,user:string,job:any,outcome:string) {
 if(outcome==='temporary'||outcome==='needs_part')await db.query(`INSERT INTO job_suggestions(workspace_id,source,sender_user_id,sender_name,client_id,site_id,from_work_order_id,report_follow_up_of,title,problem,priority,preferred_technician_id,tenant_unit,tenant_name,tenant_phone)
 VALUES($1,'agent',$2,(SELECT coalesce(name,'Team member') FROM users WHERE id=$2),$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12)
 ON CONFLICT(workspace_id,report_follow_up_of) WHERE report_follow_up_of IS NOT NULL DO UPDATE SET title=excluded.title,problem=excluded.problem WHERE job_suggestions.status='pending'`,[ws,user,job.client_id,job.site_id,job.id,`Follow up: ${job.title}`,(await db.query('SELECT report_part FROM work_orders WHERE id=$1',[job.id])).rows[0].report_part??'',job.priority,job.assignee_id,job.tenant_unit,job.tenant_name,job.tenant_phone]);
 if(outcome==='cant_fix')await notify(db,ws,user,job,'cant_fix');
 // Fixed: the status change already tells the client the job is done (notify_status_change), so no second notice here.
}
async function notify(db:PoolClient,ws:string,user:string,job:any,kind:ReturnMessage|'done',at?:string|Date,supervisors=true) {
 const recipients=(await db.query(`SELECT m.user_id,p.language,w.timezone FROM members m JOIN workspaces w ON w.id=m.workspace_id
 LEFT JOIN user_preferences p ON p.user_id=m.user_id WHERE m.workspace_id=$1 AND m.archived_at IS NULL AND
 (($4 AND (m.role='admin' OR m.role='staff' AND coalesce(m.staff_kind,'')<>'office')) OR
 (m.role='client' AND m.client_id=$2 AND (m.user_id=$3 OR coalesce(m.client_kind,'manager')='manager')))`,[ws,job.client_id,job.created_by,supervisors])).rows;
 for(const r of recipients){
  const body=kind==='done'?statusLine(r.language,'done',job.order_number,job.title).body:returnVisitLine(r.language,kind,at,r.timezone);
  await db.query(`INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,work_order_title,job_step_body)
  VALUES($1,$2,'job_next_step','work_orders',$3,$4,$5,$6)`,[r.user_id,ws,job.id,user,job.title,body]);
 }
}
/** The elevated writes check live membership and the exact job together under a row lock. */
async function context(db:PoolClient,user:string,ws:string,id:string,lock=true) {
 uuid.parse(ws);uuid.parse(id);
 const m=(await db.query('SELECT role,staff_kind,client_kind,client_id FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL',[ws,user])).rows[0];
 if(!m)throw denied();
 const job=(await db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2'+(lock?' FOR UPDATE':''),[ws,id])).rows[0];
 if(!job||job.archived_at||m.role==='technician'&&job.assignee_id!==user||m.role==='client'&&(job.client_id!==m.client_id||(m.client_kind==='household'&&job.created_by!==user)))throw denied();
 return {c:{db,user,ws,...m} as Context,job};
}
const canBookRole=(c:Context,job:any)=>['admin','staff'].includes(c.role)||c.role==='technician'&&job.assignee_id===c.user||c.role==='client'&&job.client_id===c.client_id&&(job.created_by===c.user||c.client_kind==='manager');
async function canBookReturn(c:Context,job:any,visits?:{rebooked_at:unknown}[]) {
 if(!canBookRole(c,job)||!['open','scheduled','in_progress'].includes(job.status))return false;
 if(job.part_arrived_at)return true;
 return visits?visits.some(v=>!v.rebooked_at):!!(await c.db.query('SELECT 1 FROM job_visits WHERE workspace_id=$1 AND work_order_id=$2 AND rebooked_at IS NULL',[c.ws,job.id])).rowCount;
}
async function validate(c:Context,job:any,d:Action) {
 await assertPriceReleased(c.db,c.ws,job.id);
 const team=['admin','staff'].includes(c.role),assigned=c.role==='technician'&&job.assignee_id===c.user;
 if(d.action==='follow_up'){
  if(!team)throw denied();
  if(!['temporary','needs_part'].includes(job.report_outcome)||job.archived_at)throw invalid('Save the report first.');
  if(!(await c.db.query("SELECT 1 FROM job_suggestions WHERE workspace_id=$1 AND report_follow_up_of=$2 AND status='pending'",[c.ws,job.id])).rowCount)throw invalid('This follow up visit was already answered.');
 }else if(d.action==='no_access'){
  if(!assigned)throw denied();
  if(!['scheduled','in_progress'].includes(job.status))throw invalid('This visit is not ready.');
  if(d.photo_id&&!(await c.db.query('SELECT 1 FROM shared_photos WHERE workspace_id=$1 AND id=$2 AND uploaded_by=$3 AND suggestion_id IS NULL AND NOT EXISTS(SELECT 1 FROM job_photos p WHERE p.id=shared_photos.id)',[c.ws,d.photo_id,c.user])).rowCount)throw denied();
 }else if(d.action==='part_arrived'){
  if(!team&&!assigned)throw denied();
  if(!job.follow_up_of||job.status!=='waiting_on_parts'||!(await c.db.query("SELECT 1 FROM work_orders WHERE workspace_id=$1 AND id=$2 AND report_outcome='needs_part'",[c.ws,job.follow_up_of])).rowCount)throw invalid('Create the follow up visit first.');
 }else{
  if(!canBookRole(c,job))throw denied();
  if(!await canBookReturn(c,job))throw invalid('This visit is not ready.');
  if(!d.scheduled_for)throw invalid('Choose a free visit time.');
  await assertFreeVisit(c,job,d.scheduled_for);
 }
}
export async function jobNextStep(user:string,ws:string,id:string) {
 // Reads retain the existing job visibility rules.
 await inWorkspace(user,ws,c=>row(c,'work_orders',id));
 return withSystem(async db=>{
  const {c,job}=await context(db,user,ws,id,false);
  await assertPriceReleased(c.db,c.ws,job.id);
 const team=['admin','staff'].includes(c.role),assigned=c.role==='technician'&&job.assignee_id===user;
  const follow=(await db.query('SELECT id,title,status,report_part,part_arrived_at,assignee_id FROM work_orders WHERE workspace_id=$1 AND follow_up_of=$2 AND archived_at IS NULL',[ws,id])).rows[0]??null;
  const draft=(await db.query("SELECT id,status FROM job_suggestions WHERE workspace_id=$1 AND report_follow_up_of=$2",[ws,id])).rows[0]??null;
  const visits=(await db.query('SELECT id,visited_at,photo_id,rebooked_at FROM job_visits WHERE workspace_id=$1 AND work_order_id=$2 ORDER BY visited_at DESC',[ws,id])).rows;
  const canBook=await canBookReturn(c,job,visits);
  return {title:job.title as string,label:team||assigned?labels[job.report_outcome as keyof typeof labels]??null:job.report_outcome==='fixed'?labels.fixed:null,
   outcome:team||assigned?job.report_outcome:null,part:team||assigned?job.report_part:null,follow:team||assigned?follow:null,
   can_follow:team&&!follow&&draft?.status==='pending'&&['temporary','needs_part'].includes(job.report_outcome),
   can_arrive:(team||assigned)&&job.follow_up_of&&job.status==='waiting_on_parts',
   can_no_access:assigned&&['scheduled','in_progress'].includes(job.status),can_book:canBook,visits};
 },user);
}
export async function returnSlots(user:string,ws:string,id:string) {
 return withSystem(async db=>{
  const {c,job}=await context(db,user,ws,id);
  // Validate eligibility without inventing a candidate time.
  if(!await canBookReturn(c,job))throw denied();
  return slotsForJob(c,job);
 },user);
}
export async function prepareJobNextStep(user:string,ws:string,id:string,body:unknown) {
 const d=input.parse(body);
 return withSystem(async db=>{
  const {c,job}=await context(db,user,ws,id);await validate(c,job,d);
  if(d.action==='follow_up'&&(await db.query('SELECT 1 FROM work_orders WHERE workspace_id=$1 AND follow_up_of=$2',[ws,id])).rowCount)throw invalid('This follow up visit already exists.');
  const summary=d.action==='follow_up'?'Create a follow up visit?':d.action==='part_arrived'?'The part has arrived. Open the follow up visit?':d.action==='no_access'?'Record that you could not get in and ask for a new time?':'Book this visit?';
  const args={...d,id,updated_at:new Date(job.updated_at).toISOString(),visited_at:new Date().toISOString()};
  const a=(await db.query("INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why,before) VALUES($1,$2,'job_next_step',$3,$4,$5,$6) RETURNING id",[ws,user,JSON.stringify(args),summary,'Nothing changes until you say yes.',JSON.stringify(job)])).rows[0];
  return {available:true,pending_action:{id:a.id,tool:'job_next_step',summary,why:'Nothing changes until you say yes.',scheduled_for:d.scheduled_for}};
 },user);
}
/** Consuming the card and writing its change share one transaction. A retry cannot book or notify twice. */
export async function confirmJobNextStep(user:string,ws:string,actionId:string) {
 return asAgent({kind:'assistant'},()=>withSystem(async db=>{
  const a=(await db.query("SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND id=$3 AND tool='job_next_step' FOR UPDATE",[ws,user,actionId])).rows[0];
  if(!a)throw denied();
  if(a.consumed_at||a.declined_at||new Date(a.expires_at)<=new Date())throw new ApiError(409,'closed','This change was already answered or has expired.');
  const d=input.parse({action:a.args.action,...(a.args.photo_id?{photo_id:a.args.photo_id}:{}),...(a.args.scheduled_for?{scheduled_for:a.args.scheduled_for}:{})});
  const {c,job}=await context(db,user,ws,a.args.id);await validate(c,job,d);
  if(new Date(job.updated_at).toISOString()!==a.args.updated_at)throw new ApiError(409,'stale','This job changed. Review the next step again.');
  await db.query("SELECT set_config('app.return_visit',$1,true)",[job.id]);
  let id=job.id;
  if(d.action==='follow_up'){
   id=await createReportFollowUp(c,job);
  }else if(d.action==='part_arrived'){
   await db.query("UPDATE work_orders SET status='open',part_arrived_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",[ws,id]);
  }else if(d.action==='no_access'){
   if(d.photo_id)await db.query(`INSERT INTO job_photos(id,workspace_id,client_id,work_order_id,kind,mime,bytes,width,height,taken_by)
    SELECT id,workspace_id,$4,$5,'before',mime,bytes,width,height,uploaded_by FROM shared_photos WHERE workspace_id=$1 AND id=$2 AND uploaded_by=$3`,[ws,d.photo_id,user,job.client_id,id]);
   await db.query('INSERT INTO job_visits(workspace_id,work_order_id,technician_id,visited_at,photo_id) VALUES($1,$2,$3,$4,$5)',[ws,id,user,a.args.visited_at,d.photo_id??null]);
   await notify(db,ws,user,job,'no_access',a.args.visited_at);
  }else{
   await db.query("UPDATE work_orders SET status='scheduled',scheduled_for=$3,on_way_at=NULL,visit_confirmed_for=NULL,part_arrived_at=NULL WHERE workspace_id=$1 AND id=$2",[ws,id,d.scheduled_for]);
   await db.query('UPDATE job_visits SET rebooked_at=clock_timestamp() WHERE workspace_id=$1 AND work_order_id=$2 AND rebooked_at IS NULL',[ws,id]);
   if(job.part_arrived_at)await notify(db,ws,user,job,'part_booked',d.scheduled_for,false);
  }
  await db.query("UPDATE assistant_actions SET consumed_at=now(),outcome='done',after=$2 WHERE id=$1",[a.id,JSON.stringify({id,action:d.action})]);
  return {available:true,reply:'Saved.',logged:true,id,action:d.action};
 },user));
}
/** Fixed phrase routing runs before the model. It only opens the same card as the job page. */
export async function quickJobStep(user:string,ws:string,words:string) {
 const noAccess=/(?:\bno access\b|\b(?:i )?can['’]?t get in\b|ما (?:اقدر|أقدر|قدرت) (?:ادخل|أدخل)|الباب مقفل|अंदर नहीं जा सकता|अंदर नहीं जा पा रहा|अंदर नहीं जा सका)/i.test(words);
 const arrived=/(?:the )?part (?:has )?arrived.*\bWO\s*(\d+)/i.exec(words);
 if(!noAccess&&!arrived)return null;
 return inWorkspace(user,ws,async c=>{
  if(noAccess&&c.role!=='technician'||arrived&&!['admin','staff','technician'].includes(c.role))throw denied();
  const jobs=noAccess?(await c.db.query("SELECT id,status FROM work_orders WHERE workspace_id=$1 AND assignee_id=$2 AND status IN ('scheduled','in_progress') AND archived_at IS NULL ORDER BY (status='in_progress') DESC,scheduled_for NULLS LAST LIMIT 2",[ws,user])).rows:(await c.db.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND order_number=$2 AND archived_at IS NULL',[ws,arrived![1]])).rows;
  if(noAccess&&jobs[0]?.status==='in_progress'&&jobs[1]?.status!=='in_progress')jobs.splice(1);
  if(jobs.length!==1)return {available:true,reply:'Open the job to choose its next step.',quick:true};
  let id=jobs[0].id;
  if(arrived){const state=await jobNextStep(user,ws,id);if(state.follow)id=state.follow.id;}
  return {available:true,reply:noAccess?'Could not get in':'Part arrived',job_step:{id,mode:noAccess?'no_access':'part_arrived'},quick:true};
 });
}

/** Both the report card and Suggested queue approve the same stored draft. */
async function createReportFollowUp(c:Context,job:any) {
 const {db,ws,user}=c;
 const suggestion=(await db.query("SELECT id FROM job_suggestions WHERE workspace_id=$1 AND report_follow_up_of=$2 AND status='pending' FOR UPDATE",[ws,job.id])).rows[0];
 if(!suggestion)throw new ApiError(409,'decided','This follow up visit was already answered.');
 const id=(await db.query(`INSERT INTO work_orders(workspace_id,client_id,site_id,title,trade,created_by,source,follow_up_of,status,preferred_technician_id,report_part,tenant_unit,tenant_name,tenant_phone)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,[ws,job.client_id,job.site_id,`Follow up: ${job.title}`,job.trade,job.created_by,job.source,job.id,job.report_outcome==='needs_part'?'waiting_on_parts':'open',job.assignee_id,job.report_part,job.tenant_unit,job.tenant_name,job.tenant_phone])).rows[0].id;
 // The follow up card explicitly says to keep the same technician. Only parts return visits inherit assignment.
 if(job.report_outcome==='needs_part'&&job.assignee_id)await db.query('UPDATE work_orders SET assignee_id=$3 WHERE workspace_id=$1 AND id=$2',[ws,id,job.assignee_id]);
 await db.query("UPDATE job_suggestions SET status='approved',work_order_id=$3,decided_by=$4,decided_at=now() WHERE workspace_id=$1 AND id=$2",[ws,suggestion.id,id,user]);
 return id;
}
export async function approveReportFollowUp(user:string,ws:string,suggestionId:string) {
 return withSystem(async db=>{
  const draft=(await db.query('SELECT report_follow_up_of FROM job_suggestions WHERE workspace_id=$1 AND id=$2',[ws,suggestionId])).rows[0];
  if(!draft?.report_follow_up_of)throw denied();
  const {c,job}=await context(db,user,ws,draft.report_follow_up_of);
  await validate(c,job,{action:'follow_up'});
  const id=await createReportFollowUp(c,job);
  return {id:suggestionId,status:'approved',work_order_id:id};
 },user);
}
