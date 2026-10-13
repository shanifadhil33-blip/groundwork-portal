import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { InitialResourceProvider, resourceKey } from '../components/app/initial-resources';
import { useResource } from '../components/app/resource';
import { AppContext, type Membership } from '../components/app/context';
import { Dashboard } from '../components/app/dashboard';
import { RequestError } from '../lib/ui/api';
import { addLookupOrder, validateRow, validationLookup } from '../lib/import/validate';
import type { Context } from '../lib/services/shared';
function Resource({url}:{url:string}) {
 const result=useResource<{value:string}>(url);
 return <span>{result.loading?'loading':result.error instanceof RequestError?`${result.error.status}:${result.error.code}`:result.data?.value}</span>;
}
it('renders request-local initial data before any client effects, matching query keys',()=>{
 const html=renderToStaticMarkup(<InitialResourceProvider resources={{'/api/orders?status=open&pageSize=6':{data:{value:'ready'}}}}><Resource url="/api/orders?pageSize=6&status=open"/></InitialResourceProvider>);
 expect(html).toContain('ready');expect(html).not.toContain('loading');
 expect(resourceKey('/api/orders?')).toBe('/api/orders');
 const isolated=renderToStaticMarkup(<Resource url="/api/orders?pageSize=6&status=open"/>);
 expect(isolated).toContain('loading');expect(isolated).not.toContain('ready');
});
it('keeps hidden-record errors and nested resource seeds scoped to the current page',()=>{
 const html=renderToStaticMarkup(<InitialResourceProvider resources={{'/api/order':{data:{value:'parent'}}}}><InitialResourceProvider resources={{'/api/order':{error:{status:404,code:'not_found',message:'Unavailable'}}}}><Resource url="/api/order"/></InitialResourceProvider></InitialResourceProvider>);
 expect(html).toContain('404:not_found');expect(html).not.toContain('parent');
});
it('server renders the work queue before effects without metric tiles',()=>{
 const member:Membership={workspace_id:'workspace',workspace_name:'Company',role:'admin',client_id:null,client_name:null};
 const html=renderToStaticMarkup(<AppContext.Provider value={{me:{user:{id:'user',name:'Admin',email:'admin@example.com',image:null},memberships:[member]},member,workspace:{id:'workspace',name:'Company',timezone:'Asia/Dubai',is_demo:true,country:'AE',region:null,currency:'AED'},reload:()=>{},updateName:()=>{}}}><InitialResourceProvider resources={{
  '/api/workspaces/workspace/work-orders?overdue=true&sort=due_on&dir=asc&pageSize=5':{data:{data:[]}},
  '/api/workspaces/workspace/work-orders?status=open&status=waiting_on_parts&sort=updated_at&dir=asc&pageSize=100':{data:{data:[]}},
  '/api/workspaces/workspace/dashboard':{data:{by_status:{open:12},overdue:7,waiting_on_parts:3,pending_queue_rows:2,last_supplier_sync_at:null}},
  '/api/workspaces/workspace/audit?pageSize=5':{data:{data:[{id:'entry',at:'2026-10-11T10:00:00Z',actor:{name:'Admin'},summary:'Created repair request',entity:'work_orders',entity_id:'order'}]}},
  '/api/workspaces/workspace/supplier/sync-runs':{data:[]},
 }}><Dashboard/></InitialResourceProvider></AppContext.Provider>);
 expect(html).toContain('Nothing needs action now');expect(html).not.toContain('class="tile');expect(html).not.toContain('Created repair request');expect(html).not.toContain('sync');expect(html.replace(/<div class="card first-run[\s\S]*$/,'')).not.toContain('skeleton');expect(html).toContain('Get started');
});
it('validates 500 mapped rows from one lookup read and preserves duplicate/date rules',async()=>{
 const site={id:'site-a',client_id:'client-a',name:'Marina',address:'12 Road',client_name:'Harbor'};
 const query=vi.fn(async()=>({rows:[{timezone:'Asia/Dubai',sites:[site],orders:[{order_number:9,title:'Existing job',status:'open',site_id:site.id,external_ref:'USED',due_on:null,scheduled_for:null}]}]}));
 const c={ws:'workspace',db:{query}} as unknown as Context;
 const inputs=Array.from({length:500},(_,i)=>({title:`Job ${i}`,site:'12 Road',client:'Harbor',priority:'normal',external_ref:`REF-${i}`,due_on:'2026-11-13',scheduled_for:'2026-11-12'}));
 const lookup=await validationLookup(c,inputs),seen=new Map<string,number>();
 const results=[];for(const [i,input] of inputs.entries())results.push(await validateRow(c,input,seen,i+1,lookup));
 expect(results.every(r=>r.status==='valid')).toBe(true);expect(query).toHaveBeenCalledTimes(1);
 expect(results[0].data).toMatchObject({site_id:site.id,due_on:'2026-11-13',scheduled_for:'2026-11-12'});
 const duplicate=await validateRow(c,{...inputs[0],external_ref:'USED'},undefined,1,lookup);
 expect(duplicate.errors[0]).toMatchObject({field:'external_ref',code:'duplicate_ref',message:'External reference already used by WO-9.'});
 const repeated=await validateRow(c,inputs[0],seen,501,lookup);
 expect(repeated.errors).toContainEqual(expect.objectContaining({code:'duplicate_file',message:'Duplicate of row 1'}));
 addLookupOrder(lookup,{order_number:10,title:'Another job',status:'open',site_id:site.id,external_ref:null,due_on:'2026-11-13',scheduled_for:'2026-11-12'});
 const same=await validateRow(c,{...inputs[0],title:'Another job',external_ref:''},undefined,1,lookup);
 expect(same.errors).toContainEqual(expect.objectContaining({code:'duplicate_open',message:'Already open as work order WO-10'}));
 expect(query).toHaveBeenCalledTimes(1);
});
