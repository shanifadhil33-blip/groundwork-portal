import { reportEmergency } from './emergencies';
import { detectEmergency } from '../emergency';
import { z } from 'zod';
import { ApiError, invalid, missing } from '../http';
import { withSystem } from '../db';
import { allowTeam, inWorkspace, name, priority, replay, row, uuid } from './shared';
export const suggestionInput=z.object({title:name,problem:z.string().trim().max(20000).default(''),client_id:uuid.nullable().optional(),site_id:uuid.nullable().optional(),from_work_order_id:uuid.nullable().optional(),priority:priority.default('normal'),preferred_window:z.string().trim().max(200).nullable().optional(),photo_ids:z.array(uuid).max(4).default([]),voice_note_text:z.string().trim().max(20000).nullable().optional()}).strict();
export type SuggestionSource='agent'|'client'|'household'|'technician'|'whatsapp';
export async function createSuggestion(user:string,ws:string,body:unknown,source?:SuggestionSource,key?:string,intake?:{name:string;phone:string;sender_user_id?:string|null},emergencyHandled=false){
 const data=suggestionInput.parse(body);
 const emergency=emergencyHandled?null:await reportEmergency(user,ws,`${data.title} ${data.problem}`,{site_id:data.site_id,work_order_id:data.from_work_order_id,title:data.title});
 if(emergency)return {...(emergency.request??emergency.job??{}),...emergency};
 if(detectEmergency(`${data.title} ${data.problem}`))(data as {priority?:string}).priority='urgent';
 return inWorkspace(user,ws,async c=>{
  if(intake||source==='whatsapp')allowTeam(c);
  const actualSource=intake?'whatsapp':c.role==='client'?(c.client_kind==='household'?'household':'client'):c.role==='technician'?'technician':source??'agent';
  if(c.role==='client'){
   if(data.client_id&&data.client_id!==c.client_id)throw invalid('Choose one of your own sites.','client_id');
   data.client_id=c.client_id;
   if(!data.site_id)throw invalid('Choose a site.','site_id');
   if(c.client_kind==='household'&&!data.preferred_window)throw invalid('Tell us what time suits you for the visit.','preferred_window');
  }
  if(c.role==='technician'&&!data.site_id)throw invalid('Choose a site on one of your jobs.','site_id');
  if(data.site_id){const site=await row(c,'sites',data.site_id);if(data.client_id&&site.client_id!==data.client_id)throw invalid('Choose a site for this client.','site_id');data.client_id=site.client_id;
   if(site.archived_at||(await row(c,'clients',site.client_id)).archived_at)throw invalid('This site or client is archived.','site_id');}
  if(data.from_work_order_id){const job=await row(c,'work_orders',data.from_work_order_id);if(job.site_id!==data.site_id||job.client_id!==data.client_id)throw invalid('Choose the same site as this job.','from_work_order_id');}
  const sender=intake?.sender_user_id??(intake?null:user),senderName=intake?.name??String((await c.db.query('SELECT name FROM visible_user($1)',[user])).rows[0]?.name??'Team member');
  return replay(c.db,user,ws+'/suggestions',key,data,async()=>{
   const fields={...data,photo_ids:JSON.stringify(data.photo_ids),workspace_id:ws,source:actualSource,sender_user_id:sender,sender_name:senderName,sender_phone:intake?.phone??null};const keys=Object.keys(fields);
   if(data.photo_ids.length){const photos=(await c.db.query('SELECT id FROM shared_photos WHERE workspace_id=$1 AND uploaded_by=$2 AND suggestion_id IS NULL AND id=ANY($3::uuid[]) FOR UPDATE',[ws,user,data.photo_ids])).rows;if(photos.length!==new Set(data.photo_ids).size)throw invalid('Choose your own photos.','photo_ids');}
   const made=(await c.db.query(`INSERT INTO job_suggestions(${keys.join(',')}) VALUES(${keys.map((_,i)=>'$'+(i+1)).join(',')}) RETURNING *`,Object.values(fields))).rows[0];if(data.photo_ids.length)await c.db.query('UPDATE shared_photos SET suggestion_id=$3 WHERE workspace_id=$1 AND uploaded_by=$2 AND id=ANY($4::uuid[])',[ws,user,made.id,data.photo_ids]);delete made.sender_phone;return made;
  });
 });
}
export async function listSuggestions(user:string,ws:string){return inWorkspace(user,ws,async c=>{
 const data=(await c.db.query(`SELECT s.id,s.source,s.sender_user_id,s.sender_name,s.client_id,s.site_id,s.from_work_order_id,s.title,s.problem,s.priority,s.preferred_window,s.photo_ids,s.voice_note_text,s.status,s.decline_reason,s.work_order_id,s.created_at,s.decided_at,st.name AS site_name FROM job_suggestions s LEFT JOIN sites st ON st.workspace_id=s.workspace_id AND st.id=s.site_id WHERE s.workspace_id=$1 ORDER BY (s.status='pending') DESC,s.created_at DESC,s.id`,[ws])).rows;
 return {data,pending_count:data.filter(s=>s.status==='pending').length};
});}
export async function decideSuggestion(user:string,ws:string,id:string,body:unknown){
 uuid.parse(id);
 const d=z.discriminatedUnion('decision',[z.object({decision:z.literal('approved'),overrides:suggestionInput.partial().optional()}).strict(),z.object({decision:z.literal('declined'),reason:z.string().trim().min(1).max(2000)}).strict()]).parse(body);
 return inWorkspace(user,ws,async c=>{
  allowTeam(c);
  const s=(await c.db.query('SELECT * FROM job_suggestions WHERE workspace_id=$1 AND id=$2 FOR UPDATE',[ws,id])).rows[0];if(!s)throw missing();
  if(s.status!=='pending')throw new ApiError(409,'decided','This suggestion was already answered.');
  let jobId:string|null=null;
  if(d.decision==='approved'){
   const supplied=(body as {overrides?:Record<string,unknown>}).overrides;
   const overrides=Object.fromEntries(Object.entries(d.overrides??{}).filter(([key])=>supplied&&Object.hasOwn(supplied,key)));
   const v={...s,...overrides};if(!v.site_id||!v.client_id)throw invalid('Choose a client and site before approving.','site_id');
   const site=await row(c,'sites',v.site_id),client=await row(c,'clients',v.client_id);
   if(site.client_id!==v.client_id||site.archived_at||client.archived_at)throw invalid('Choose an active site for this client.','site_id');
   await c.db.query('UPDATE job_suggestions SET title=$3,problem=$4,priority=$5,client_id=$6,site_id=$7,preferred_window=$8 WHERE workspace_id=$1 AND id=$2',[ws,id,v.title,v.problem,v.priority,v.client_id,v.site_id,v.preferred_window??null]);
   const senderIsClient=s.sender_user_id&&(await c.db.query("SELECT 1 FROM members WHERE workspace_id=$1 AND user_id=$2 AND role='client' AND client_id=$3 AND archived_at IS NULL",[ws,s.sender_user_id,v.client_id])).rowCount;
   // Preserve the original client as creator so household history and status notices remain private.
   const emergencyKind=detectEmergency(`${v.title} ${v.problem}`);
   const emergencyTrade=emergencyKind==='flood'?'plumbing':emergencyKind==='electric'?'electrical':emergencyKind==='gas'||emergencyKind==='fire'?'general':null;
   jobId=(await c.db.query('INSERT INTO work_orders(workspace_id,client_id,site_id,title,description,priority,preferred_window,source,created_by,trade) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id',[ws,v.client_id,v.site_id,v.title,v.problem,v.priority,v.preferred_window??null,senderIsClient?'client':'manual',senderIsClient?s.sender_user_id:user,emergencyTrade])).rows[0].id;
  }
  if(jobId)await c.db.query("INSERT INTO job_photos(id,workspace_id,client_id,work_order_id,kind,mime,bytes,width,height,taken_by) SELECT id,workspace_id,$3,$4,'before',mime,bytes,width,height,uploaded_by FROM shared_photos WHERE workspace_id=$1 AND suggestion_id=$2",[ws,id,(d.decision==='approved'?d.overrides?.client_id:undefined)??s.client_id,jobId]);
  return (await c.db.query('UPDATE job_suggestions SET status=$3,decline_reason=$4,work_order_id=$5,decided_by=$6,decided_at=now() WHERE workspace_id=$1 AND id=$2 RETURNING id,status,decline_reason,work_order_id',[ws,id,d.decision,d.decision==='declined'?d.reason:null,jobId,user])).rows[0];
 });
}

/** Audit A7: the person who sent a request may withdraw it while the office has not answered. It is removed, with its bell items. */
export async function withdrawSuggestion(user:string,ws:string,id:string){
 uuid.parse(id);
 await inWorkspace(user,ws,async c=>{
  const s=(await c.db.query('SELECT status,sender_user_id FROM job_suggestions WHERE workspace_id=$1 AND id=$2',[ws,id])).rows[0];
  if(!s||s.sender_user_id!==user)throw missing();
  if(s.status!=='pending')throw new ApiError(409,'decided','The office already answered this request.');
 });
 await withSystem(async db=>{
  const gone=(await db.query("DELETE FROM job_suggestions WHERE workspace_id=$1 AND id=$2 AND sender_user_id=$3 AND status='pending' RETURNING id",[ws,id,user])).rowCount;
  if(!gone)throw new ApiError(409,'decided','The office already answered this request.');
  await db.query('DELETE FROM notifications WHERE workspace_id=$1 AND entity_id=$2',[ws,id]);
 },user);
 return {withdrawn:true};
}
