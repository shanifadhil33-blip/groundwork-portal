import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem, withUser } from '../lib/db';
import { ids, orderId, siteId } from '../lib/fixture';
import { createComment, createWorkOrder, getWorkOrder, getWorkOrderByNumber, listWorkOrders, patchWorkOrder } from '../lib/services/work-orders';
import { dashboard } from '../lib/services/workspaces';
import { approveRow, errorReport, mapImport, queueImport, uploadImport } from '../lib/services/imports';
import { callTool } from '../lib/agent/tools';
import { isOverdue } from '../lib/dates';
const ws=ids.ridgeline;
afterAll(closePools);
const version=(o:{updated_at:Date|string})=>new Date(o.updated_at).toISOString();
async function upload(text:string) {const form=new FormData();form.set('file',new Blob([text]),'qa.csv');return uploadImport(ids.dana,ws,new Request('http://localhost/import',{method:'POST',body:form}));}

it('scheduling moves Open work to Scheduled, increments counts, and records specific changes',async()=>{
 const o=await createWorkOrder(ids.dana,ws,{title:'QA schedule',site_id:siteId(1),due_on:'2026-11-20'});
 const before=await dashboard(ids.dana,ws);
 const changed=await patchWorkOrder(ids.dana,ws,o.id,{assignee_id:ids.sam,scheduled_for:'2026-11-13',updated_at:version(o)});
 expect(changed.status).toBe('scheduled');expect(changed.due_on).toBe('2026-11-20');expect(changed.scheduled_for.toISOString()).toBe('2026-11-13T05:00:00.000Z');
 expect((await dashboard(ids.dana,ws)).by_status.scheduled).toBe(before.by_status.scheduled+1);
 const detail=await getWorkOrder(ids.dana,ws,o.id);
 expect(detail.timeline).toEqual(expect.arrayContaining([expect.objectContaining({kind:'assignment_changed',details:{assignee_name:'Sam'}}),expect.objectContaining({kind:'schedule_changed'}),expect.objectContaining({kind:'status_changed',details:{from_status:'open',to_status:'scheduled'}})]));
 const created=await createWorkOrder(ids.dana,ws,{title:'Already scheduled',site_id:siteId(1),scheduled_for:'2026-11-14'});expect(created.status).toBe('scheduled');
});
it('Done rejects edits through services and SQL, allows comments, and permits only admin reopening',async()=>{
 let o=await createWorkOrder(ids.dana,ws,{title:'QA completed',site_id:siteId(1)});
 for(const status of ['scheduled','in_progress','done'])o=await patchWorkOrder(ids.dana,ws,o.id,{status,updated_at:version(o)});
 for(const user of [ids.dana,ids.sam]) {
  await expect(patchWorkOrder(user,ws,o.id,{description:'Changed',updated_at:version(o)})).rejects.toBeTruthy();
  await expect(withUser(user,db=>db.query("UPDATE work_orders SET priority='urgent' WHERE id=$1",[o.id]))).rejects.toMatchObject({code:'P0403'});
 }
 await expect(patchWorkOrder(ids.sam,ws,o.id,{status:'open',reopen:true,updated_at:version(o)})).rejects.toMatchObject({status:403});
 await createComment(ids.priya,ws,o.id,{body:'Thank you',visibility:'client'});
 const reopened=await patchWorkOrder(ids.dana,ws,o.id,{status:'open',reopen:true,updated_at:version(o)});expect(reopened.status).toBe('open');
 const next=await patchWorkOrder(ids.dana,ws,reopened.id,{description:'Follow-up visit',updated_at:version(reopened)});expect(next.description).toBe('Follow-up visit');
 const seeded=await getWorkOrder(ids.dana,ws,orderId(8));
 expect((await patchWorkOrder(ids.dana,ws,seeded.id,{status:'scheduled',reopen:true,updated_at:version(seeded)})).status).toBe('scheduled');
});
it('the overdue list, detail, dashboard and agent agree, exclude today and future deadlines, and ignore visit dates',async()=>{
 const day=(await withUser(ids.dana,db=>db.query("SELECT to_char(now() AT TIME ZONE timezone,'YYYY-MM-DD') AS day FROM workspaces WHERE id=$1",[ws]))).rows[0].day;
 const future=await createWorkOrder(ids.dana,ws,{title:'QA future deadline',site_id:siteId(1),due_on:'2099-01-01',scheduled_for:'2000-01-01'});
 const today=await createWorkOrder(ids.dana,ws,{title:'QA today deadline',site_id:siteId(1),due_on:day});
 const old=await createWorkOrder(ids.dana,ws,{title:'QA overdue',site_id:siteId(1),due_on:'2000-01-01'});
 const list=await listWorkOrders(ids.dana,ws,new URLSearchParams({overdue:'true',pageSize:'100',sort:'due_on',dir:'asc'}));
 expect(list.data.map(o=>o.id)).toContain(old.id);expect(list.data.map(o=>o.id)).not.toContain(future.id);expect(list.data.map(o=>o.id)).not.toContain(today.id);
 expect((await dashboard(ids.dana,ws)).overdue).toBe(list.total);
 expect((await getWorkOrder(ids.priya,ws,old.id)).overdue).toBe(true);
 expect(list.data.every(o=>isOverdue(o,Date.now(),'Asia/Dubai'))).toBe(true);
 const agent=await callTool({user:ids.dana,ws,kind:'agent',scope:'read'},'list_work_orders',{overdue:true,pageSize:100,sort:'due_on',dir:'asc'});
 expect(agent.structuredContent).toMatchObject({result:{total:list.total}});
});
it('numbers are allocated for every source and concurrent creation; chosen client site and description are preserved',async()=>{
 const requests=await Promise.all(Array.from({length:4},(_,i)=>createWorkOrder(ids.priya,ws,{title:`QA client ${i}`,description:'Keep this description',site_id:siteId(3)})));
 expect(new Set(requests.map(o=>o.order_number)).size).toBe(4);
 for(const o of requests){expect(o.site_id).toBe(siteId(3));expect(o.description).toBe('Keep this description');expect(o.order_number).toBeGreaterThan(60);expect((await getWorkOrderByNumber(ids.priya,ws,o.order_number)).id).toBe(o.id);}
 const imp=await upload('Title,Site,Due Date,Scheduled For\nQA imported number,Marina Exchange,2026-11-20,2026-11-13');
 const mapped=await mapImport(ids.dana,ws,imp.id,{mapping:imp.mapping});await queueImport(ids.dana,ws,imp.id);
 const imported=await approveRow(ids.sam,ws,mapped.rows.data[0].id,{});expect(imported.order_number).toBeGreaterThan(60);expect(imported.due_on).toBe('2026-11-20');expect(imported.status).toBe('scheduled');
 expect((await getWorkOrderByNumber(ids.priya,ws,imported.order_number)).id).toBe(imported.id);
});
it('similar titles with another site, reference or date are warnings; reused external refs are field-specific errors',async()=>{
 await createWorkOrder(ids.dana,ws,{title:'QA similar title',site_id:siteId(1),due_on:'2026-11-13'});
 const imp=await upload('Title,Site,Due Date,External Ref\nQA similar title,Pine Terrace,2026-11-13,\nQA similar title,Marina Exchange,2026-11-14,\nQA similar title,Marina Exchange,2026-11-13,NEW-REF\nDifferent title,Northgate East,2026-11-13,QA-1001');
 const mapped=await mapImport(ids.dana,ws,imp.id,{mapping:imp.mapping});
 expect(mapped.counts).toMatchObject({warning:3,error:1});expect(mapped.rows.data[3].errors[0].field).toBe('external_ref');
 const report=await errorReport(ids.dana,ws,imp.id);expect(report).toContain('Nov 13, 2026');expect(report).not.toContain('T20:00');
 const repeated=await upload('Title,Site,Due Date,External Ref\nSame title,Marina Exchange,2026-11-13,A\nSame title,Pine Terrace,2026-11-14,B\nAnother title,Northgate East,2026-11-15,A');
 const rows=await mapImport(ids.dana,ws,repeated.id,{mapping:repeated.mapping});expect(rows.rows.data[1].status).toBe('valid');expect(rows.rows.data[2].errors[0]).toMatchObject({field:'external_ref',code:'duplicate_file'});
});
it('seed creation activity matches record dates and precedes comments and later activity',async()=>{
 const rows=(await withSystem(db=>db.query("SELECT o.title,o.created_at,o.updated_at,e.created_at AS event_at FROM work_orders o JOIN work_order_events e ON e.work_order_id=o.id WHERE o.workspace_id=$1 AND e.kind='created'",[ws]))).rows;
 expect(rows.every(r=>r.created_at.getTime()===r.event_at.getTime())).toBe(true);
 const invalid=(await withSystem(db=>db.query('SELECT c.id FROM comments c JOIN work_orders o ON o.id=c.work_order_id WHERE c.created_at<o.created_at'))).rows;expect(invalid).toEqual([]);
});

it('provides names for phone cards while preserving client and workspace isolation',async()=>{
 const staff=await listWorkOrders(ids.sam,ws,new URLSearchParams('pageSize=100'));
 const first=staff.data.find((o:{id:string})=>o.id===orderId(1));
 expect(first).toMatchObject({site_name:'Marina Exchange',client_name:'Harbor & Pine Coworking',assignee_name:'Sam'});
 const client=await listWorkOrders(ids.priya,ws,new URLSearchParams('pageSize=100'));
 expect(client.data.length).toBeGreaterThan(0);
 for(const item of client.data){expect(item.client_id).toBe(ids.harbor);expect(item.client_name).toBe('Harbor & Pine Coworking');expect(item.site_name).toBeTruthy();}
 expect(client.data.some((o:{client_name:string})=>o.client_name==='Northgate Self Storage')).toBe(false);
 await expect(listWorkOrders(ids.priya,ids.summit,new URLSearchParams())).rejects.toMatchObject({status:404});
});
it('Unassigned filters return only orders with no assignment and retain client isolation',async()=>{
 const staff=await listWorkOrders(ids.sam,ids.ridgeline,new URLSearchParams('assignee_id=unassigned&pageSize=100'));expect(staff.total).toBeGreaterThan(0);expect(staff.data.every(o=>o.assignee_id===null)).toBe(true);
 const client=await listWorkOrders(ids.priya,ids.ridgeline,new URLSearchParams('assignee_id=unassigned&pageSize=100'));expect(client.data.every(o=>o.assignee_id===null&&o.client_id===ids.harbor)).toBe(true);
});
