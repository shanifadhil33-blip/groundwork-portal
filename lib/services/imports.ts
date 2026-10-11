import { formatDate, localDate } from '../dates';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { ApiError, invalid, missing, forbidden, readBody } from '../http';
import { inWorkspace, type Context, uuid, insert } from './shared';
import { fields, type Mapping } from '../import/fields';
import { validateRow, validationLookup, addLookupOrder, type RowData } from '../import/validate';
import { draftSummaries } from '../ai';
function staff<T>(user:string,ws:string,fn:(c:Context)=>Promise<T>){return inWorkspace(user,ws,c=>{if(c.role==='client')throw missing();return fn(c);});}
async function lock(c:Context){await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['imports:'+c.ws]);}
async function get(c:Context,table:'imports'|'import_rows',id:string){uuid.parse(id);const r=(await c.db.query(`SELECT * FROM ${table} WHERE workspace_id=$1 AND id=$2 FOR UPDATE`,[c.ws,id])).rows[0];if(!r)throw missing();return r;}
const querySchema=z.object({status:z.enum(['valid','warning','error']).optional(),decision:z.enum(['pending','approved','rejected']).optional(),page:z.coerce.number().int().min(1).default(1)}).strict();
async function rows(c:Context,id:string|undefined,params:URLSearchParams,queue=false){
 const q=querySchema.parse(Object.fromEntries(params));
 const where=`workspace_id=$1 AND ($2::uuid IS NULL OR import_id=$2) AND ($3::text IS NULL OR status=$3) AND ($4::text IS NULL OR decision=$4)${queue?" AND queued AND decision='pending'":''}`;
 const values=[c.ws,id??null,q.status??null,q.decision??null];
 const data=(await c.db.query(`SELECT *, count(*) OVER()::int AS _total, true AS ai_is_suggestion FROM import_rows WHERE ${where} ORDER BY created_at,import_id,row_number LIMIT 50 OFFSET $5`,[...values,(q.page-1)*50])).rows;
 const total=data[0]?data[0]._total:(await c.db.query(`SELECT count(*)::int AS n FROM import_rows WHERE ${where}`,values)).rows[0].n;
 for(const item of data)delete item._total;
 return {data,total,page:q.page,pageSize:50};
}
async function summary(c:Context,id:string){const imp=await get(c,'imports',id);const counts=(await c.db.query(`SELECT count(*) FILTER(WHERE status='valid')::int AS valid,count(*) FILTER(WHERE status='warning')::int AS warning,count(*) FILTER(WHERE status='error')::int AS error,count(*) FILTER(WHERE queued AND decision='pending')::int AS pending,count(*) FILTER(WHERE decision='approved')::int AS approved,count(*) FILTER(WHERE decision='rejected')::int AS rejected FROM import_rows WHERE workspace_id=$1 AND import_id=$2`,[c.ws,id])).rows[0];const {raw_rows:_,...publicImport}=imp;return {...publicImport,counts,result_summary:`${counts.approved} created, ${counts.rejected} rejected`};}
async function complete(c:Context,id:string){await c.db.query(`UPDATE imports SET status=CASE WHEN EXISTS(SELECT 1 FROM import_rows WHERE import_id=$2 AND workspace_id=$1 AND queued AND decision='pending') THEN 'queued' ELSE 'completed' END WHERE workspace_id=$1 AND id=$2`,[c.ws,id]);}
export async function uploadImport(user:string,ws:string,req:Request){return staff(user,ws,async c=>{
 const query=z.object({force:z.enum(['true','false']).optional()}).strict().parse(Object.fromEntries(new URL(req.url).searchParams));
 let content:Buffer,filename:string;
 if(req.headers.get('content-type')?.includes('multipart/form-data')){
  // Bound the body before parsing multipart, including overhead.
  const reader=req.body?.getReader();if(!reader)throw invalid('Choose a CSV or XLSX file.','file');
  const chunks:Uint8Array[]=[];let size=0;
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2*1024*1024+65536){await reader.cancel();const prefix=Buffer.concat([...chunks,part.value]).subarray(0,65536).toString('utf8');const name=prefix.match(/filename="([^"]+)"/)?.[1]??'Uploaded file';throw invalid(`${name}: the file limit is 2 MB.`,'file');}chunks.push(part.value);}
  let form:FormData;try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':req.headers.get('content-type')!}}).formData();}catch{throw invalid('Send a multipart CSV or XLSX file.','file');}
  const file=form.get('file');if(!file||typeof file==='string')throw invalid('Choose a CSV or XLSX file.','file');filename=file.name;content=Buffer.from(await file.arrayBuffer());
 }else{z.object({sample:z.literal(true)}).strict().parse(await readBody(req));filename='sample-work-orders.csv';content=await readFile(new URL('../../data/sample-work-orders.csv',import.meta.url));}
 const {parseFile}=await import('../import/parse');
 const parsed=parseFile(content,filename),hash=createHash('sha256').update(content).digest('hex');
 await lock(c);
 const existing=(await c.db.query('SELECT id,created_at FROM imports WHERE workspace_id=$1 AND content_hash=$2 ORDER BY created_at LIMIT 1',[ws,hash])).rows[0];
 if(existing&&query.force!=='true')throw new ApiError(409,'already_imported',`You already imported this file on ${localDate(existing.created_at,(await c.db.query('SELECT timezone FROM workspaces WHERE id=$1',[ws])).rows[0].timezone)}.`,{import_id:[existing.id]});
 const imp=(await c.db.query(`INSERT INTO imports(workspace_id,filename,row_count,created_by,content_hash,headers,raw_rows,mapping) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,status`,[ws,filename,parsed.rows.length,user,hash,JSON.stringify(parsed.headers),JSON.stringify(parsed.rows),JSON.stringify(parsed.mapping)])).rows[0];
 return {...imp,headers:parsed.headers,mapping:parsed.mapping,row_count:parsed.rows.length};
});}
export function listImports(user:string,ws:string){return staff(user,ws,async c=>(await c.db.query('SELECT id,filename,row_count,status,created_at FROM imports WHERE workspace_id=$1 ORDER BY created_at DESC,id',[ws])).rows);}
export function getImport(user:string,ws:string,id:string){return staff(user,ws,c=>summary(c,id));}
export function importRows(user:string,ws:string,id:string,params:URLSearchParams){return staff(user,ws,async c=>{await get(c,'imports',id);return rows(c,id,params);});}
export function mapImport(user:string,ws:string,id:string,body:unknown){return staff(user,ws,async c=>{
 await lock(c);const imp=await get(c,'imports',id);
 if(!['uploaded','mapped'].includes(imp.status))throw new ApiError(409,'queued','This import has already been sent to review.');
 const mapping=z.object({mapping:z.object(Object.fromEntries(fields.map(f=>[f,z.string().optional()]))).strict()}).strict().parse(body).mapping as Mapping;
 if(!mapping.title)throw invalid('Map a title column.','mapping.title');
 for(const header of Object.values(mapping))if(!imp.headers.includes(header))throw invalid('Choose a detected column header.','mapping');
 await c.db.query('DELETE FROM import_rows WHERE workspace_id=$1 AND import_id=$2',[ws,id]);
 const inputs:Partial<RowData>[]=imp.raw_rows.map((raw:Record<string,string>)=>Object.fromEntries(fields.map(f=>[f,mapping[f]?raw[mapping[f]!]:'' ])));
 const lookup=await validationLookup(c,inputs),seen=new Map<string,number>(),validated=[];
 for(const [index,input] of inputs.entries())validated.push({row_number:index+1,...await validateRow(c,input,seen,index+1,lookup)});
 await c.db.query(`INSERT INTO import_rows(workspace_id,import_id,row_number,data,errors,warnings,status)
 SELECT $1,$2,r.row_number,r.data,r.errors,r.warnings,r.status FROM jsonb_to_recordset($3::jsonb) AS r(row_number int,data jsonb,errors jsonb,warnings jsonb,status text) ORDER BY r.row_number`,[ws,id,JSON.stringify(validated)]);
 await c.db.query("UPDATE imports SET status='mapped',mapping=$3 WHERE workspace_id=$1 AND id=$2",[ws,id,JSON.stringify(mapping)]);
 return {...await summary(c,id),rows:await rows(c,id,new URLSearchParams())};
});}
export function queueImport(user:string,ws:string,id:string){return staff(user,ws,async c=>{
 await lock(c);const imp=await get(c,'imports',id);if(imp.status==='uploaded')throw invalid('Map and validate this file before sending it to review.');
 await c.db.query("UPDATE import_rows SET queued=true WHERE workspace_id=$1 AND import_id=$2 AND status<>'error' AND NOT queued",[ws,id]);await complete(c,id);
 return {...await summary(c,id),excluded:(await c.db.query("SELECT id,row_number,errors FROM import_rows WHERE workspace_id=$1 AND import_id=$2 AND status='error' ORDER BY row_number",[ws,id])).rows};
});}
export function listQueue(user:string,ws:string,params:URLSearchParams){return staff(user,ws,c=>rows(c,undefined,params,true));}
const editsSchema=z.object(Object.fromEntries(fields.map(f=>[f,z.string().max(f==='description'?20000:500).optional()]))).strict();
async function approve(c:Context,id:string,edits?:Partial<RowData>){
 const r=await get(c,'import_rows',id);
 if(r.decision==='approved')return (await c.db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=$2',[c.ws,r.work_order_id])).rows[0];
 if(!r.queued||r.decision!=='pending')throw new ApiError(409,'not_pending','This row is not awaiting approval.');
 const result=await validateRow(c,{...r.data,...edits});
 if(result.errors.length)throw new ApiError(422,'validation','Fix the row before approving it.',Object.fromEntries(result.errors.map(e=>[e.field,[e.message]])));
 const d=result.data;
 const schedule=d.scheduled_for?(d.scheduled_for.length===10?(await c.db.query("SELECT ($1::date + time '09:00') AT TIME ZONE timezone AS value FROM workspaces WHERE id=$2",[d.scheduled_for,c.ws])).rows[0].value.toISOString():d.scheduled_for):null;
 const order=await insert(c,'work_orders',{workspace_id:c.ws,client_id:d.client_id,site_id:d.site_id,title:d.title,description:d.description,priority:d.priority,due_on:d.due_on||null,scheduled_for:schedule,external_ref:d.external_ref||null,source:'import',created_by:c.user});
 await c.db.query("UPDATE import_rows SET decision='approved',work_order_id=$3,data=$4,errors='[]',warnings=$5,status=$6 WHERE workspace_id=$1 AND id=$2",[c.ws,id,order.id,JSON.stringify(d),JSON.stringify(result.warnings),result.status]);await complete(c,r.import_id);return order;
}
export function approveRow(user:string,ws:string,id:string,body:unknown){return staff(user,ws,async c=>{await lock(c);const parsed=z.object({edits:editsSchema.optional()}).strict().parse(body);return approve(c,id,parsed.edits);});}
export function bulkApprove(user:string,ws:string,body:unknown){return staff(user,ws,async c=>{
 const {row_ids}=z.object({row_ids:z.array(uuid).min(1).max(500)}).strict().parse(body);if(c.role==='staff'&&row_ids.length>25)throw forbidden();await lock(c);
 const ids=[...new Set(row_ids)].sort();
 const selected=(await c.db.query('SELECT * FROM import_rows WHERE workspace_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[ws,ids])).rows;
 const byId=new Map(selected.map(r=>[r.id,r]));
 const existing=(await c.db.query('SELECT * FROM work_orders WHERE workspace_id=$1 AND id=ANY($2::uuid[])',[ws,selected.filter(r=>r.decision==='approved').map(r=>r.work_order_id)])).rows;
 const existingById=new Map(existing.map(r=>[r.id,r]));
 const lookup=await validationLookup(c,selected.filter(r=>r.decision!=='approved').map(r=>r.data));
 const prepared=[],preparedRows=new Map<string,string>();let failure:ApiError|undefined;
 for(const id of ids) {
  const r=byId.get(id.toLowerCase());
  if(!r){failure=missing();break;}
  if(r.decision==='approved'||preparedRows.has(r.id))continue;
  if(!r.queued||r.decision!=='pending'){failure=new ApiError(409,'not_pending','This row is not awaiting approval.');break;}
  const result=await validateRow(c,r.data,undefined,1,lookup);
  if(result.errors.length){failure=new ApiError(422,'validation','Fix the row before approving it.',Object.fromEntries(result.errors.map(e=>[e.field,[e.message]])));break;}
  const order_id=randomUUID();preparedRows.set(r.id,order_id);prepared.push({id:r.id,order_id,...result});
  // Later rows see the orders created earlier in this same batch, as before.
  addLookupOrder(lookup,{...result.data,site_id:result.data.site_id!,external_ref:result.data.external_ref||null,due_on:result.data.due_on||null,scheduled_for:result.data.scheduled_for||null,status:result.data.scheduled_for?'scheduled':'open',order_number:`@${order_id}@`});
 }
 const created=prepared.length?(await c.db.query('SELECT * FROM approve_import_batch($1,$2,$3::jsonb)',[ws,user,JSON.stringify(prepared)])).rows:[];
 const createdById=new Map(created.map(r=>[r.id,r]));
 if(failure) {
  if(failure.fields)for(const messages of Object.values(failure.fields))for(let i=0;i<messages.length;i++)messages[i]=messages[i].replace(/@([0-9a-f-]+)@/g,(_,id)=>String(createdById.get(id)?.order_number));
  throw failure; // The enclosing transaction rolls back the entire batch.
 }
 const data=ids.map(id=>{const r=byId.get(id.toLowerCase())!;return r.decision==='approved'?existingById.get(r.work_order_id):createdById.get(preparedRows.get(r.id));});
 return {data,created:data.length};
});}
export function rejectRow(user:string,ws:string,id:string,body:unknown){return staff(user,ws,async c=>{await lock(c);const {reason}=z.object({reason:z.string().trim().min(1).max(2000)}).strict().parse(body);const r=await get(c,'import_rows',id);if(!r.queued||r.decision!=='pending')throw new ApiError(409,'not_pending','This row is not awaiting review.');const result=(await c.db.query("UPDATE import_rows SET decision='rejected',reason=$3,rejected_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING *",[ws,id,reason])).rows[0];await complete(c,r.import_id);return {...result,undo_until:new Date(result.rejected_at.getTime()+600000).toISOString()};});}
export function undoRow(user:string,ws:string,id:string){return staff(user,ws,async c=>{await lock(c);const r=await get(c,'import_rows',id);const result=(await c.db.query("UPDATE import_rows SET decision='pending',reason=NULL,rejected_at=NULL WHERE workspace_id=$1 AND id=$2 AND decision='rejected' AND rejected_at>clock_timestamp()-interval '10 minutes' RETURNING *",[ws,id])).rows[0];if(!result)throw new ApiError(409,'undo_expired','Undo is available for 10 minutes after rejecting a row.');await complete(c,r.import_id);return result;});}
export function errorReport(user:string,ws:string,id:string){return staff(user,ws,async c=>{await get(c,'imports',id);const data=(await c.db.query("SELECT row_number,data,errors FROM import_rows WHERE workspace_id=$1 AND import_id=$2 AND status='error' ORDER BY row_number",[ws,id])).rows;const timezone=(await c.db.query('SELECT timezone FROM workspaces WHERE id=$1',[ws])).rows[0].timezone;const cell=(v:unknown)=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replaceAll('"','""')+'"';return [['row_number',...fields,'reason'],...data.map(r=>[r.row_number,...fields.map(f=>['due_on','scheduled_for'].includes(f)&&r.data[f]&&localDate(r.data[f],timezone)?formatDate(r.data[f],timezone):f==='priority'?String(r.data[f]).replace(/^./,s=>s.toUpperCase()):r.data[f]),r.errors.map((e:{message:string})=>e.message).join('; ')])].map(r=>r.map(cell).join(',')).join('\r\n');});}
export async function importDrafts(user:string,ws:string,id:string){
 const pending=await staff(user,ws,async c=>{await get(c,'imports',id);return (await c.db.query("SELECT id,data FROM import_rows WHERE workspace_id=$1 AND import_id=$2 AND queued AND decision='pending' AND ai_summary IS NULL ORDER BY row_number LIMIT 25",[ws,id])).rows;});
 if(!pending.length)return {available:true,stored:0,suggestion:true};
 const result=await draftSummaries(pending);if(!result.available)return result;
 return staff(user,ws,async c=>{await lock(c);await get(c,'imports',id);const stored=(await c.db.query('SELECT store_import_drafts($1,$2,$3::jsonb) AS stored',[ws,id,JSON.stringify(result.items)])).rows[0].stored;return {available:true,stored,suggestion:true};});
}
