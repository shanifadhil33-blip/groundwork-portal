import { afterAll,beforeEach,expect,it } from 'vitest';
import * as XLSX from 'xlsx';
import { randomUUID } from 'node:crypto';
import { closePools,withUser,withSystem } from '../lib/db';
import { ids,siteId } from '../scripts/seed';
import { setAuthResolverForTests } from '../lib/auth';
import * as s from '../lib/services/imports';
import { parseFile } from '../lib/import/parse';
import * as uploadRoute from '../app/api/workspaces/[ws]/imports/route';
import * as detailRoute from '../app/api/workspaces/[ws]/imports/[id]/route';
import * as rowsRoute from '../app/api/workspaces/[ws]/imports/[id]/rows/route';
import * as mappingRoute from '../app/api/workspaces/[ws]/imports/[id]/mapping/route';
import * as queueRoute from '../app/api/workspaces/[ws]/imports/[id]/queue/route';
import * as draftsRoute from '../app/api/workspaces/[ws]/imports/[id]/draft-summaries/route';
import * as reportRoute from '../app/api/workspaces/[ws]/imports/[id]/error-report/route';
import * as listQueueRoute from '../app/api/workspaces/[ws]/queue/route';
import * as approveRoute from '../app/api/workspaces/[ws]/queue/[rowId]/approve/route';
import * as rejectRoute from '../app/api/workspaces/[ws]/queue/[rowId]/reject/route';
import * as undoRoute from '../app/api/workspaces/[ws]/queue/[rowId]/undo/route';
import * as bulkRoute from '../app/api/workspaces/[ws]/queue/bulk-approve/route';
let user:string|null=ids.dana;
beforeEach(()=>{user=ids.dana;setAuthResolverForTests(async()=>user);});
afterAll(async()=>{setAuthResolverForTests();await closePools();});
const sampleRequest=(force=false)=>new Request('http://localhost/api'+(force?'?force=true':''),{method:'POST',headers:{'Content-Type':'application/json'},body:'{"sample":true}'});
async function upload(content:string|Buffer,filename='test.csv',force=false){const form=new FormData();form.set('file',new Blob([new Uint8Array(Buffer.from(content))]),filename);return s.uploadImport(ids.dana,ids.ridgeline,new Request('http://localhost/api'+(force?'?force=true':''),{method:'POST',body:form}));}
async function staged(title='Unique '+randomUUID(),count=1){const data='Title,Site,Client,Priority,Date,External Ref\n'+Array.from({length:count},(_,i)=>`${title} ${i},Marina Exchange,Harbor & Pine Coworking,normal,2026-11-20,${randomUUID()}`).join('\n');const imp=await upload(data);await s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:imp.mapping});return {imp,rows:(await s.importRows(ids.dana,ids.ridgeline,imp.id,new URLSearchParams())).data};}
async function queued(count=1){const result=await staged(undefined,count);await s.queueImport(ids.dana,ids.ridgeline,result.imp.id);return result;}
it('sample end to end yields 35 created, 2 rejected and preserves dates and source',async()=>{
 const imp=await s.uploadImport(ids.sam,ids.ridgeline,sampleRequest());expect(imp.row_count).toBe(40);
 const mapped=await s.mapImport(ids.sam,ids.ridgeline,imp.id,{mapping:imp.mapping});expect(mapped.counts).toMatchObject({valid:37,warning:0,error:3});
 const q=await s.queueImport(ids.sam,ids.ridgeline,imp.id);expect(q.excluded).toHaveLength(3);expect(q.counts.pending).toBe(37);
 const rows=mapped.rows.data.filter((r:{status:string;id:string})=>r.status!=='error');
 for(const r of rows.slice(0,2))await s.rejectRow(ids.sam,ids.ridgeline,r.id,{reason:'Not needed'});
 await expect(s.bulkApprove(ids.sam,ids.ridgeline,{row_ids:rows.slice(2).map((r:{id:string})=>r.id)})).rejects.toMatchObject({status:403});
 const approved=await s.bulkApprove(ids.dana,ids.ridgeline,{row_ids:rows.slice(2).map((r:{id:string})=>r.id)});expect(approved.data).toHaveLength(35);expect(approved.data[0].source).toBe('import');expect(approved.data[0].due_on).toBe('2026-11-20');expect(approved.data[0].scheduled_for.toISOString()).toBe('2026-11-18T05:00:00.000Z');expect(approved.data.every(o=>o.order_number>0)).toBe(true);
 const summary=await s.getImport(ids.dana,ids.ridgeline,imp.id);expect(summary.status).toBe('completed');expect(summary.result_summary).toBe('35 created, 2 rejected');
 const report=await s.errorReport(ids.sam,ids.ridgeline,imp.id);expect(report).toContain('reason');expect(report).toContain('External reference already used by WO-1');expect(report.split('\r\n')).toHaveLength(4);
});
it('reads XLSX and fuzzy headers through SheetJS',()=>{const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Job Title','Site Address','Due Date'],['Test','12 Road','2026-11-20']]),'Orders');const result=parseFile(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'orders.xlsx');expect(result.rows).toHaveLength(1);expect(result.mapping).toMatchObject({title:'Job Title',site:'Site Address',due_on:'Due Date'});});
it('rejects unsupported files, size and data row limits with filename and limit',async()=>{
 expect(()=>parseFile(Buffer.alloc(2*1024*1024+1),'large.csv')).toThrow('large.csv: the file limit is 2 MB');expect(()=>parseFile(Buffer.from('Title\nhello'),'tasks.pdf')).toThrow('tasks.pdf: use a CSV or XLSX');expect(()=>parseFile(Buffer.from('Title\n'+Array(501).fill('hello').join('\n')),'many.csv')).toThrow('many.csv: the limit is 500 data rows');expect(parseFile(Buffer.from('Title\n'+Array(500).fill('hello').join('\n')),'allowed.csv').rows).toHaveLength(500);
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Title'],...Array(501).fill(['Task'])]),'Orders');expect(()=>parseFile(XLSX.write(book,{type:'buffer',bookType:'xlsx'}),'many.xlsx')).toThrow('500 data rows');
});
it('file dedupe is scoped, serialized and force permits re-upload',async()=>{
 const text='Title,Site\nFile dedupe '+randomUUID()+',Marina Exchange';const first=await upload(text);
 await expect(upload(text)).rejects.toMatchObject({status:409,fields:{import_id:[first.id]}});expect((await upload(text,'test.csv',true)).id).not.toBe(first.id);
 const form=new FormData();form.set('file',new Blob([text]),'test.csv');const other=await s.uploadImport(ids.summitAdmin,ids.summit,new Request('http://localhost',{method:'POST',body:form}));expect(other.id).not.toBe(first.id);
 const unique=text+' new';const results=await Promise.allSettled([upload(unique),upload(unique)]);expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
});
it('validates unknown site, bad dates, required title, priority warning, client mismatch and in-file duplicates',async()=>{
 const title=randomUUID();const imp=await upload(`Title,Site,Client,Priority,Date\n${title},Marina Exchange,Harbor & Pine Coworking,mystery,2026-11-20\n  ${title.toUpperCase()}  ,Marina Exchange,Harbor & Pine Coworking,normal,2026-11-20\nBad site,Elsewhere,,normal,2026-11-20\nBad date,Marina Exchange,,normal,2026-02-30\n,Marina Exchange,,normal,\nMismatch,Marina Exchange,Northgate Self Storage,normal,`);
 const result=await s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:imp.mapping});expect(result.counts).toMatchObject({warning:1,error:5});expect(result.rows.data[1].errors[0].message).toBe('Duplicate of row 1');expect(result.rows.data[3].errors[0].code).toBe('bad_date');expect(result.rows.data[0].data.priority).toBe('normal');
});
it('detects exact open-order and external-ref duplicates; references stay unique after completion',async()=>{
 const ref=randomUUID(),title=randomUUID();await withUser(ids.dana,db=>db.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,external_ref,created_by) VALUES($1,$2,$3,$4,$5,$6)",[ids.ridgeline,ids.harbor,siteId(1),title,ref,ids.dana]));
 const imp=await upload(`Title,Site,External Ref\n${title.toUpperCase()},Marina Exchange,\nAnother title,Marina Exchange,${ref}`);const result=await s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:imp.mapping});expect(result.counts).toMatchObject({warning:1,error:1});
 await withUser(ids.dana,db=>db.query("UPDATE work_orders SET status='done' WHERE external_ref=$1",[ref]));const again=await s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:imp.mapping});expect(again.counts).toMatchObject({valid:1,error:1});expect(again.rows.data[1].errors[0].field).toBe('external_ref');
});
it('queue and approve are idempotent including concurrent double approve',async()=>{
 const {imp,rows}=await queued();await s.queueImport(ids.dana,ids.ridgeline,imp.id);expect((await s.getImport(ids.dana,ids.ridgeline,imp.id)).counts.pending).toBe(1);
 const [a,b]=await Promise.all([s.approveRow(ids.sam,ids.ridgeline,rows[0].id,{}),s.approveRow(ids.dana,ids.ridgeline,rows[0].id,{})]);expect(a.id).toBe(b.id);expect((await s.approveRow(ids.dana,ids.ridgeline,rows[0].id,{})).id).toBe(a.id);
 expect((await withUser(ids.dana,db=>db.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND title=$2',[ids.ridgeline,a.title]))).rowCount).toBe(1);
 await expect(s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:imp.mapping})).rejects.toMatchObject({status:409});
});
it('edit-then-approve uses row validation and duplicate recheck',async()=>{
 const {rows}=await queued();await expect(s.approveRow(ids.dana,ids.ridgeline,rows[0].id,{edits:{title:'',site:'Unknown'}})).rejects.toMatchObject({status:422});
 await expect(s.approveRow(ids.dana,ids.ridgeline,rows[0].id,{edits:{scheduled_for:'bad'}})).rejects.toMatchObject({status:422});
 const changed=await s.approveRow(ids.dana,ids.ridgeline,rows[0].id,{edits:{title:'Edited '+randomUUID(),priority:'urgent',site:'Northgate East',client:'Northgate Self Storage'}});expect(changed.priority).toBe('urgent');expect(changed.client_id).toBe(ids.northgate);
 const next=await queued();await withUser(ids.dana,db=>db.query('INSERT INTO work_orders(workspace_id,client_id,site_id,title,created_by,due_on,external_ref) VALUES($1,$2,$3,$4,$5,$6,$7)',[ids.ridgeline,ids.harbor,siteId(1),next.rows[0].data.title,ids.dana,next.rows[0].data.due_on,next.rows[0].data.external_ref]));await expect(s.approveRow(ids.dana,ids.ridgeline,next.rows[0].id,{})).rejects.toMatchObject({status:422});
});
it('serializes distinct imports approving the same external reference',async()=>{
 const title='Race '+randomUUID(),ref=randomUUID();
 const first=await upload(`Title,Description,Site,Due Date,External Ref\n${title},First file,Marina Exchange,2026-11-20,${ref}`),second=await upload(`Title,Description,Site,Due Date,External Ref\n${title},Second file,Marina Exchange,2026-11-20,${ref}`);
 const a=await s.mapImport(ids.dana,ids.ridgeline,first.id,{mapping:first.mapping}),b=await s.mapImport(ids.dana,ids.ridgeline,second.id,{mapping:second.mapping});
 await s.queueImport(ids.dana,ids.ridgeline,first.id);await s.queueImport(ids.dana,ids.ridgeline,second.id);
 const result=await Promise.allSettled([s.approveRow(ids.dana,ids.ridgeline,a.rows.data[0].id,{}),s.approveRow(ids.sam,ids.ridgeline,b.rows.data[0].id,{})]);expect(result.filter(r=>r.status==='fulfilled')).toHaveLength(1);
});
it('reject requires reason, undo reopens completed import and expires after ten minutes',async()=>{
 const {imp,rows}=await queued();await expect(s.rejectRow(ids.sam,ids.ridgeline,rows[0].id,{reason:' '})).rejects.toThrow();const rejection=await s.rejectRow(ids.sam,ids.ridgeline,rows[0].id,{reason:'Not needed'});expect(rejection.undo_until).toBeTruthy();expect((await s.getImport(ids.dana,ids.ridgeline,imp.id)).status).toBe('completed');expect((await s.undoRow(ids.sam,ids.ridgeline,rows[0].id)).decision).toBe('pending');expect((await s.getImport(ids.dana,ids.ridgeline,imp.id)).status).toBe('queued');await s.rejectRow(ids.sam,ids.ridgeline,rows[0].id,{reason:'Still not needed'});await withSystem(db=>db.query("UPDATE import_rows SET rejected_at=now()-interval '11 minutes' WHERE id=$1",[rows[0].id]));await expect(s.undoRow(ids.sam,ids.ridgeline,rows[0].id)).rejects.toMatchObject({status:409});
});
it('bulk staff limit is 25; admin can approve 26; failed bulk is atomic',async()=>{
 const {rows}=await queued(26);await expect(s.bulkApprove(ids.sam,ids.ridgeline,{row_ids:rows.map(r=>r.id)})).rejects.toMatchObject({status:403});await expect(s.bulkApprove(ids.dana,ids.ridgeline,{row_ids:[rows[0].id,randomUUID()]})).rejects.toMatchObject({status:404});expect((await s.importRows(ids.dana,ids.ridgeline,rows[0].import_id,new URLSearchParams('decision=approved'))).total).toBe(0);expect((await s.bulkApprove(ids.dana,ids.ridgeline,{row_ids:rows.map(r=>r.id)})).created).toBe(26);
});
it('row pagination and filters; uploads require mapping before queue',async()=>{
 const {imp}=await staged(undefined,51);expect((await s.importRows(ids.dana,ids.ridgeline,imp.id,new URLSearchParams('status=valid&page=2'))).data).toHaveLength(1);await expect(s.importRows(ids.dana,ids.ridgeline,imp.id,new URLSearchParams('page=0'))).rejects.toThrow();
 const uploaded=await upload('Title\nUnmapped '+randomUUID());await expect(s.queueImport(ids.dana,ids.ridgeline,uploaded.id)).rejects.toMatchObject({status:422});
});
it('every import and queue endpoint returns neutral 404 for clients and other tenants',async()=>{
 const {imp,rows}=await queued();await withSystem(db=>db.query("UPDATE members SET role='staff' WHERE workspace_id=$1 AND user_id=$2",[ids.summit,ids.summitAdmin]));
 const routes:[((req:Request,ctx:any)=>Promise<Response>),string,unknown][]=[
 [uploadRoute.GET,'GET',undefined],[uploadRoute.POST,'POST',{sample:true}],[detailRoute.GET,'GET',undefined],[rowsRoute.GET,'GET',undefined],[mappingRoute.POST,'POST',{mapping:imp.mapping}],[queueRoute.POST,'POST',undefined],[draftsRoute.POST,'POST',undefined],[reportRoute.GET,'GET',undefined],[listQueueRoute.GET,'GET',undefined],[approveRoute.POST,'POST',{}],[rejectRoute.POST,'POST',{reason:'No'}],[undoRoute.POST,'POST',undefined],[bulkRoute.POST,'POST',{row_ids:[rows[0].id]}]];
 for(const identity of [ids.priya,ids.summitAdmin]){user=identity;for(const [handler,method,body] of routes){const response=await handler(new Request('http://localhost/api',{method,...(body===undefined?{}:{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})}),{params:Promise.resolve({ws:ids.ridgeline,id:imp.id,rowId:rows[0].id})});expect(response.status).toBe(404);expect((await response.json()).error.code).toBe('not_found');}}
 user=null;expect((await uploadRoute.GET(new Request('http://localhost/api'),{params:Promise.resolve({ws:ids.ridgeline})})).status).toBe(401);
});
it('all writes retain trigger audit records',async()=>{const {imp,rows}=await queued();await s.approveRow(ids.sam,ids.ridgeline,rows[0].id,{});const audit=await withUser(ids.dana,db=>db.query("SELECT entity,actor_id FROM audit_log WHERE entity_id=ANY($1::uuid[])",[[imp.id,rows[0].id]]));expect(audit.rows.some(r=>r.entity==='imports')).toBe(true);expect(audit.rows.some(r=>r.entity==='import_rows'&&r.actor_id===ids.sam)).toBe(true);});
it('multipart HTTP size limits name the file and error CSV downloads have correct headers',async()=>{
 const form=new FormData();form.set('file',new Blob([Buffer.alloc(2*1024*1024+100000)]),'oversized.csv');const response=await uploadRoute.POST(new Request('http://localhost/api',{method:'POST',body:form}),{params:Promise.resolve({ws:ids.ridgeline})});expect(response.status).toBe(422);expect((await response.json()).error.message).toContain('oversized.csv: the file limit is 2 MB');
 const imp=await upload('Title,Site\nUnknown report,Unknown');await s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:imp.mapping});const report=await reportRoute.GET(new Request('http://localhost/api'),{params:Promise.resolve({ws:ids.ridgeline,id:imp.id})});expect(report.status).toBe(200);expect(report.headers.get('Content-Type')).toContain('text/csv');expect(report.headers.get('Content-Disposition')).toContain('attachment');expect(await report.text()).toContain('Choose a known site');
});
it('mapping rejects nonexistent headers and imports cannot approve unqueued or error rows',async()=>{const {imp,rows}=await staged();await expect(s.mapImport(ids.dana,ids.ridgeline,imp.id,{mapping:{title:'Not present'}})).rejects.toMatchObject({status:422});await expect(s.approveRow(ids.dana,ids.ridgeline,rows[0].id,{})).rejects.toMatchObject({status:409});const bad=await upload('Title,Site\nBad queue,Unknown');const mapped=await s.mapImport(ids.dana,ids.ridgeline,bad.id,{mapping:bad.mapping});await s.queueImport(ids.dana,ids.ridgeline,bad.id);await expect(s.approveRow(ids.dana,ids.ridgeline,mapped.rows.data[0].id,{})).rejects.toMatchObject({status:409});});
it('lists rejected queue rows with reasons and allows only admins to restore after undo expires',async()=>{
 const {imp,rows}=await queued();const row=rows[0];await s.rejectRow(ids.sam,ids.ridgeline,row.id,{reason:'Client asked us to hold the visit'});
 await withSystem(db=>db.query("UPDATE import_rows SET rejected_at=now()-interval '1 day' WHERE id=$1",[row.id]));
 const history=await s.listQueue(ids.sam,ids.ridgeline,new URLSearchParams('decision=rejected'));expect(history.data.find(r=>r.id===row.id)?.reason).toBe('Client asked us to hold the visit');
 expect((await s.listQueue(ids.sam,ids.ridgeline,new URLSearchParams())).data.some(r=>r.id===row.id)).toBe(false);
 await expect(s.restoreRow(ids.sam,ids.ridgeline,row.id)).rejects.toMatchObject({status:403});await expect(s.restoreRow(ids.priya,ids.ridgeline,row.id)).rejects.toMatchObject({status:404});await expect(s.restoreRow(ids.summitAdmin,ids.ridgeline,row.id)).rejects.toMatchObject({status:404});
 expect((await s.restoreRow(ids.dana,ids.ridgeline,row.id)).decision).toBe('pending');expect((await s.getImport(ids.dana,ids.ridgeline,imp.id)).status).toBe('queued');expect((await s.listQueue(ids.dana,ids.ridgeline,new URLSearchParams('decision=rejected'))).data.some(r=>r.id===row.id)).toBe(false);
});
