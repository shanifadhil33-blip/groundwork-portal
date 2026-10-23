import React from 'react';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../lib/languages';
import { isEnglish } from '../lib/i18n';
import { priceChangeEventTemplate, notificationTemplates } from '../lib/ui/notifications';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { WorkOrderDetail } from '../components/app/work-order-detail';
import { WorkOrderList } from '../components/app/work-order-list';
import { AppContext, type Membership } from '../components/app/context';
const state=vi.hoisted(()=>({order:{} as any,words:{} as Record<string,string>}));
vi.mock('../components/app/notification-language',()=>({useNotificationLanguage:()=>({words:state.words})}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({push:vi.fn(),prefetch:vi.fn()})}));
vi.mock('../components/app/initial-resources',()=>({useInitialResource:()=>({data:{data:[state.order],total:1}})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,reload:()=>{},data:!url?null:url?.endsWith('/checklist')?{steps:[{name:'Test the repair',done:true}],materials:[{id:'part',name:'Washer',quantity:2}],editable:false}:url?.endsWith('/photos')?[]:url?.includes('/suggest')?{workers:[]}:url?.endsWith('/members')?[]:url?.endsWith('/clients')?[]:url?.endsWith('/supplier/orders')?{data:[]}:state.order})}));
vi.mock('../components/ui/theme',()=>({useTheme:()=>({theme:'light',sync:()=>{}})}));
vi.mock('../components/ui/toast',()=>({useToast:()=>()=>{}}));
function fixture(extra:object={}){state.order={id:'order',order_number:54,title:'Replace pump valve',description:'Pump stopped working.',status:'in_progress',priority:'high',site_name:'Marina',client_name:'Northgate',assignee_name:'Ravi',assignee_id:'ravi',site_id:'site',client_id:'client',due_on:null,scheduled_for:'2026-11-13T09:00:00Z',created_at:'2026-11-12T10:00:00Z',updated_at:'2026-11-12T11:00:00Z',client:{name:'Northgate'},site:{name:'Marina',address:'Villa 18'},assignee:{id:'ravi',name:'Ravi'},comments:[],timeline:[],...extra};}
function render(node:React.ReactNode,role:Membership['role']){const member:Membership={workspace_id:'workspace',workspace_name:'Company',role,client_id:role==='client'?'client':null,client_name:null};return renderToStaticMarkup(<AppContext.Provider value={{member,workspace:{id:'workspace',name:'Company',timezone:'Asia/Dubai',is_demo:true,country:'AE',region:null,currency:'AED'},me:{user:{id:'user',name:'Imran',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}>{node}</AppContext.Provider>);}
function primaries(html:string){return html.match(/class="button primary(?: |")/g)??[];}
it('keeps operational columns, priority, menus and record links in the simplified list',()=>{
 fixture();const html=render(<WorkOrderList/>,'admin');expect(html).toContain('<h1>Work orders</h1>');expect(html).toContain('data-label="Technician"');expect(html).toContain('data-label="Status"');expect(html).toContain('Priority: High');expect(html).toContain('Northgate');expect(html).toContain('Ravi');expect(html).toContain('href="/work-orders/order"');expect(html).toContain('row-menu');expect(primaries(html)).toHaveLength(1);
});
for(const role of ['admin','staff','technician','client'] as const){
 it(`retains ${role} job features with one primary action`,()=>{
 fixture({quote_status:'pending',quote_amount:85});const html=render(<WorkOrderDetail id="order"/>,role);expect(primaries(html)).toHaveLength(1);for(const title of ['Job details','Reported problem','Visits','Costs','Notes','History'])if(title==='Job details'&&role==='client')expect(html).toContain('Request details');else expect(html).toContain(title);
 expect(html).toContain('Checklist');expect(html).toContain('Materials used');expect(html).toContain('Washer');expect(html).toContain('Print job sheet');expect(html).toContain('Pump stopped working.');if(role!=='client')expect(html).toContain('Ravi');if(role==='client'){expect(html).toContain('Approve price');expect(html).toContain('Confirm this time');expect(html).not.toContain('Assignment &amp; schedule');}else if(role==='technician')expect(html).toContain('Complete job');else expect(html).toContain('Save assignment &amp; schedule');
 });
}
it('uses the visit or comment as the client primary when no quote waits for approval',()=>{
 fixture();expect(primaries(render(<WorkOrderDetail id="order"/>,'client'))).toHaveLength(1);
 fixture({status:'done',scheduled_for:null});const html=render(<WorkOrderDetail id="order"/>,'client');expect(primaries(html)).toHaveLength(1);expect(html).toContain('Send comment');expect(html).not.toContain('Approve price');
});

for(const {code} of LANGUAGES){
 for(const role of ['admin','staff','technician','client'] as const){
  it(`renders ${role} price history from the ${code} static template`,()=>{
   state.words=isEnglish(code)?{}:JSON.parse(readFileSync(`public/i18n/${code}.json`,'utf8'));
   fixture({timeline:[{id:'price',kind:'price_change',actor_id:'user',body:'Waiting for the client',created_at:'2026-11-12T11:00:00Z'}]});
   const html=render(<WorkOrderDetail id="order"/>,role);
   const history=html.slice(html.indexOf('activity-panel'));
   const template=state.words[notificationTemplates.price_change]??notificationTemplates.price_change;
   const status=state.words['Waiting for the client']??'Waiting for the client';
   expect(history).toContain(status);
   expect(history).toContain('Imran');expect(history).toContain('Replace pump valve');
   // Assert the template's fixed words too: translating only a status is insufficient.
   for(const text of template.split(/\{[a-z_]+\}/).filter(text=>/\p{L}/u.test(text)))expect(history).toContain(text);
   if(!isEnglish(code))expect(history).not.toContain('Waiting for the client');
   expect(history).not.toContain('waiting for the client on');
   state.words={};
  });
 }
}
it('recognizes every saved system price body while protecting historical titles',()=>{
 for(const body of ['Price changed','Waiting for a price','Waiting for the client','Price approved','Client said no','Client refused']){
  const message=priceChangeEventTemplate({kind:'price_change',body,work_order_title:'Original title'} as any,'Imran','New title');
  expect(message).toMatchObject({key:notificationTemplates.price_change,values:{name:'Imran',status:body,job:'Original title'},translatedValues:['status']});
 }
 expect(priceChangeEventTemplate({kind:'created'} as any,'Imran','Title')).toBeUndefined();
});
