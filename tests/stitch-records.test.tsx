// @vitest-environment jsdom
import React from 'react';
import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../lib/languages';
import { formatInLang } from '../lib/date-lang';
import { historyTemplates } from '../lib/ui/job-history';
import { DEMO_JOB_TITLES } from '../lib/demo-job-copy';
import { notificationTemplate } from '../lib/ui/notifications';
import { readTranslationCache, isEnglish } from '../lib/i18n';
import { priceChangeEventTemplate, notificationTemplates } from '../lib/ui/notifications';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { WorkOrderDetail } from '../components/app/work-order-detail';
import { WorkOrderList } from '../components/app/work-order-list';
import { AppContext, type Membership } from '../components/app/context';
const state=vi.hoisted(()=>({order:{} as any,words:{} as Record<string,string>,language:'en-IN'}));
vi.mock('../components/app/notification-language',()=>({useNotificationLanguage:()=>({words:state.words,language:state.language})}));
vi.mock('next/navigation',()=>({useSearchParams:()=>new URLSearchParams(),useRouter:()=>({push:vi.fn(),prefetch:vi.fn()})}));
vi.mock('../components/app/initial-resources',()=>({useInitialResource:()=>({data:{data:[state.order],total:1}})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,reload:()=>{},data:!url?null:url?.endsWith('/checklist')?{steps:[{name:'Test the repair',done:true}],materials:[{id:'part',name:'Washer',quantity:2}],editable:false}:url?.endsWith('/photos')?[]:url?.includes('/suggest')?{workers:[]}:url?.endsWith('/members')?[]:url?.endsWith('/clients')?[]:url?.endsWith('/supplier/orders')?{data:[]}:state.order})}));
vi.mock('../components/ui/theme',()=>({useTheme:()=>({theme:'light',sync:()=>{}})}));
vi.mock('../components/ui/toast',()=>({useToast:()=>()=>{}}));
function fixture(extra:object={}){state.order={id:'order',order_number:54,title:'Replace pump valve',description:'Pump stopped working.',status:'in_progress',priority:'high',site_name:'Marina',client_name:'Northgate',assignee_name:'Ravi',assignee_id:'ravi',site_id:'site',client_id:'client',due_on:null,scheduled_for:'2026-11-13T09:00:00Z',created_at:'2026-11-12T10:00:00Z',updated_at:'2026-11-12T11:00:00Z',client:{name:'Northgate'},site:{name:'Marina',address:'Villa 18'},assignee:{id:'ravi',name:'Ravi'},comments:[],timeline:[],...extra};}
function render(node:React.ReactNode,role:Membership['role'],demo=true){const member:Membership={workspace_id:'workspace',workspace_name:'Company',role,client_id:role==='client'?'client':null,client_name:null};return renderToStaticMarkup(<AppContext.Provider value={{member,workspace:{id:'workspace',name:'Company',timezone:'Asia/Dubai',is_demo:demo,country:'AE',region:null,currency:'AED'},me:{user:{id:'user',name:'Imran',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}>{node}</AppContext.Provider>);}
function primaries(html:string){return html.match(/class="button primary(?: |")/g)??[];}
it('keeps operational columns, priority, menus and record links in the simplified list',()=>{
 fixture();const html=render(<WorkOrderList/>,'admin');expect(html).toContain('<h1>Jobs</h1>');expect(html).toContain('data-label="Technician"');expect(html).toContain('data-label="Status"');expect(html).toContain('Priority: High');expect(html).toContain('Northgate');expect(html).toContain('Ravi');expect(html).toContain('href="/work-orders/order"');expect(html).toContain('row-menu');expect(primaries(html)).toHaveLength(1);
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

function historyDocument(html:string){return new DOMParser().parseFromString(html,'text/html');}
const historyEvents = [
 {kind:'created'},
 ...['open','scheduled','in_progress','waiting_on_parts','done','cancelled'].map(to_status=>({kind:'status_changed',details:{from_status:'scheduled',to_status}})),
 {kind:'status_changed'},
 {kind:'status_changed',from_status:'open',to_status:'scheduled'},
 {kind:'assignment_changed',details:{assignee_name:'Ravi'}},
 {kind:'assignment_changed',details:{assignee_name:null}},
 {kind:'schedule_changed',details:{scheduled_for:'2026-11-13T09:00:00Z'}},
 {kind:'schedule_changed',details:{scheduled_for:null}},
 {kind:'due_changed',details:{due_on:'2026-11-14'}},
 {kind:'due_changed',details:{due_on:null}},
 {kind:'details_changed',details:{title_changed:true,description_changed:true,priority:'urgent'}},
 ...['low','normal','high'].map(priority=>({kind:'details_changed',details:{priority}})),
 {kind:'details_changed'},
 {kind:'on_the_way'},
 {kind:'supplier_repaired'},
 {kind:'job_checklist'},
 {kind:'quote_sent'},
 {kind:'unknown_future_event'},
 ...['Price changed','Waiting for a price','Waiting for the client','Price approved','Client said no','Client refused'].map(body=>({kind:'price_change',body})),
];
for(const {code} of LANGUAGES){
 for(const role of ['admin','staff','technician','client'] as const){
  it(`renders every ${role} history sentence and attribution in ${code} without code or English fallback`,()=>{
   state.language=code;
   state.words=isEnglish(code)?{}:readTranslationCache(readFileSync(`public/i18n/${code}.json`,'utf8'),code);
   const title=DEMO_JOB_TITLES[0];
   const timeline=historyEvents.map((event,index)=>({...event,id:`event-${index}`,actor_id:index===0?null:'user',work_order_title:title,created_at:'2026-11-12T11:00:00Z',actor_kind:index===1?'assistant':index===2?'agent':'user',via_token_name:'My agent key'}));
   fixture({title:'Renamed job',timeline,comments:[
    {id:'shared',body:'Please keep my typed words.',author_id:'user',visibility:'client',work_order_title:title,created_at:'2026-11-12T11:00:00Z'},
    {id:'private',body:'Private words.',author_id:'user',visibility:'internal',work_order_title:title,created_at:'2026-11-12T11:00:00Z'},
   ]});
   const doc=historyDocument(render(<WorkOrderDetail id="order"/>,role));
   const history=doc.querySelector('.timeline')!;
   expect(history.textContent).not.toMatch(/[<{]/);
   expect(history.querySelectorAll('li')).toHaveLength(timeline.length+(role==='client'?1:2));
   expect(history.textContent).not.toContain('Renamed job');
   expect(history.textContent).toContain('Imran');
   expect(history.textContent).toContain('Ravi');
   expect(history.textContent).toContain(state.words[title]??title);
   expect(doc.querySelector('.notes-panel')!.textContent).toContain('Please keep my typed words.');
   const text=history.textContent!;
   expect(text).not.toContain('Not set');
   if(!isEnglish(code)){
    for(const key of [...Object.values(historyTemplates),'System','Unnamed key','Open','Scheduled','In Progress','Waiting on Parts','Done','Cancelled','Low','Normal','High','Urgent']){
     expect(state.words[key],key).toBeTruthy();expect(state.words[key],key).not.toBe(key);
    }
    expect(text).not.toMatch(/assigned|cleared|scheduled|updated|moved|created|added|changed|received|saved|Waiting|Price|Scheduled|Progress|Urgent|November|assistant|via AI/);
    expect(text).not.toContain(title);
   }
   expect(history.querySelector('time')!.textContent).toBe(formatInLang('2026-11-12T11:00:00Z',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'},code));
   state.words={};state.language='en-IN';
  });
 }
}
it('preserves real titles verbatim, including names that match demo titles, outside demo workspaces',()=>{
 state.words=readTranslationCache(readFileSync('public/i18n/ar-AE.json','utf8'),'ar-AE');state.language='ar-AE';
 fixture({title:DEMO_JOB_TITLES[0],timeline:[{id:'created',kind:'created',actor_id:'user',created_at:'2026-11-12T11:00:00Z'}]});
 const history=historyDocument(render(<WorkOrderDetail id="order"/>,'client',false)).querySelector('.timeline')!;
 expect(history.textContent).toContain(DEMO_JOB_TITLES[0]);expect(history.textContent).not.toContain(state.words[DEMO_JOB_TITLES[0]]);
 state.words={};state.language='en-IN';
});
it('localizes specific field events even when the client service supplies a generic update',()=>{
 state.language='ar-AE';state.words=readTranslationCache(readFileSync('public/i18n/ar-AE.json','utf8'),'ar-AE');
 const events=[{kind:'assignment_changed',details:{assignee_name:'Ravi'}},{kind:'details_changed',details:{title_changed:true}}];
 fixture({timeline:events.map((event,index)=>({...event,id:String(index),actor_id:'user',created_at:'2026-11-12T11:00:00Z',message_template:notificationTemplate({...event,timeline:true,work_order_title:'Replace pump valve'},true)}))});
 const history=historyDocument(render(<WorkOrderDetail id="order"/>,'client')).querySelector('.timeline')!;
 expect(history.textContent).toContain('Ravi');expect(history.textContent).toContain('عدّل عنوان');expect(history.textContent).not.toContain('updated');
 state.words={};state.language='en-IN';
});
for(const code of ['en-IN','ar-AE']){
 it(`preserves client booking, completion photos and price approval notices in ${code}`,()=>{
  state.language=code;state.words=isEnglish(code)?{}:readTranslationCache(readFileSync(`public/i18n/${code}.json`,'utf8'),code);
  const notices=[
   {kind:'status_changed',to_status:'scheduled'},
   {kind:'status_changed',to_status:'done'},
   {kind:'price_change',details:{state:'pending'}},
  ].map(event=>notificationTemplate({...event,timeline:true,work_order_id:'order',work_order_title:'Original title',scheduled_for:'2026-11-13T09:00:00Z',after_photos:3,timezone:'Asia/Dubai'},true));
  fixture({timeline:notices.map((message_template,index)=>({id:String(index),kind:index===2?'price_change':'status_changed',actor_id:'user',created_at:'2026-11-12T11:00:00Z',body:'Waiting for the client',message_template}))});
  const history=historyDocument(render(<WorkOrderDetail id="order"/>,'client')).querySelector('.timeline')!;
  expect(history.querySelector('a')?.getAttribute('href')).toBe('/work-orders/order#photos');
  const text=history.textContent!;
  expect(text).not.toMatch(/[<{]/);
  for(const notice of notices)for(const part of (state.words[notice.key]??notice.key).split(/\{[a-z_]+\}/).filter(part=>/\p{L}/u.test(part)))expect(text).toContain(part);
  if(code==='ar-AE')expect(text).not.toMatch(/booked|done|price|Friday|November/);
  state.words={};state.language='en-IN';
 });
}
