import { expect, it } from 'vitest';
import { validateRow, type RowData } from '../lib/import/validate';
import type { Context } from '../lib/services/shared';
const site={id:'site-a',client_id:'client',name:'Marina',client_name:'Harbor',address:'12 Road'};
const row:Partial<RowData>={title:'Repair tap',site:'Marina',client:'Harbor',due_on:'2026-11-13',scheduled_for:'2026-11-12',priority:'normal'};
function context(orders:object[]=[],referenceExists=false) {
 return {ws:'workspace',db:{query:async(sql:string)=>({rows:sql.includes('FROM sites')?[site]:sql.includes('SELECT timezone')?[{timezone:'Asia/Dubai'}]:sql.includes('lower(external_ref)')?referenceExists?[{order_number:1}]:[]:orders})}} as unknown as Context;
}
it('keeps date-only cells local and attributes invalid dates to the correct date field',async()=>{
 const result=await validateRow(context(),row);expect(result.data.due_on).toBe('2026-11-13');expect(result.data.scheduled_for).toBe('2026-11-12');expect(result.status).toBe('valid');
 const invalid=await validateRow(context(),{...row,due_on:'2026-02-30',scheduled_for:'not-a-date'});expect(invalid.errors.map(e=>e.field)).toEqual(['due_on','scheduled_for']);
 const old=await validateRow(context(),{...row,due_on:'2026-11-12T20:00:00Z',scheduled_for:'2026-11-12T20:00:00Z'});expect(old.data.due_on).toBe('2026-11-13');expect(old.data.scheduled_for).toBe('2026-11-12T20:00:00.000Z');
});
it('similar titles become warnings when the site, reference or dates differ, exact rows are errors',async()=>{
 const exact={site_id:site.id,due_on:row.due_on,scheduled_for:new Date('2026-11-12T05:00:00Z'),external_ref:null,order_number:5};
 expect((await validateRow(context([exact]),row)).errors).toContainEqual(expect.objectContaining({field:'title',code:'duplicate_open'}));
 for(const order of [{...exact,site_id:'other-site'},{...exact,external_ref:'OTHER'},{...exact,due_on:'2026-11-14'},{...exact,scheduled_for:new Date('2026-11-15T05:00:00Z')}]) {
  const result=await validateRow(context([order]),row);expect(result.errors).toEqual([]);expect(result.warnings[0].code).toBe('similar_title');
 }
});
it('reports reused references under external reference even when titles and sites differ',async()=>{
 const result=await validateRow(context([],true),{...row,external_ref:'QA-1001'});expect(result.errors[0]).toMatchObject({field:'external_ref',code:'duplicate_ref'});
 const seen=new Map<string,number>();await validateRow(context(),{...row,external_ref:'QA-1001'},seen,1);
 const next=await validateRow(context(),{...row,title:'Another task',due_on:'2026-11-20',external_ref:'QA-1001'},seen,2);expect(next.errors[0]).toMatchObject({field:'external_ref',code:'duplicate_file'});
});
