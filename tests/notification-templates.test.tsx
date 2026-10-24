// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notificationTemplates, notificationTemplate, notificationParts, renderNotification } from '../lib/ui/notifications';
import { returnVisitLine, statusLine } from '../lib/status-updates';
import { readTranslationCache, TRANSLATION_SKIP } from '../lib/i18n';
import { NotificationMessage } from '../components/app/notification-message';
import { Notifications } from '../components/app/notifications';
import { post } from '../lib/ui/api';
import { Translator, changeAppLanguage } from '../components/app/translator';
import { setNotificationLanguage } from '../components/app/notification-language';

const state=vi.hoisted(()=>({language:'hi',items:[] as unknown[]}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{language:state.language}})}));
vi.mock('../components/app/context',async original=>({...await original<typeof import('../components/app/context')>(),useApp:()=>({member:{role:'technician'},me:{user:{is_demo:false}},reload:vi.fn()})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('../lib/ui/api',()=>({request:async()=>({data:state.items,total:state.items.length,unread_count:state.items.length}),post:vi.fn()}));
vi.mock('../components/ui',()=>({
 BottomSheet:({children}:{children:React.ReactNode})=><div>{children}</div>,
 Button:({children,busy,busyLabel,variant,size,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{busy?:boolean;busyLabel?:string;variant?:string;size?:string})=><button data-no-translate {...props}>{children}</button>,
 RelativeTime:()=>null,Skeleton:()=> <span data-loading="true"/>,useToast:()=>()=>{},
 ErrorState:()=> <span>Error</span>,EmptyState:()=> <span>Empty</span>,
}));
const languages=readdirSync('public/i18n').map(file=>file.replace('.json',''));
const words=(lang:string)=>JSON.parse(readFileSync(`public/i18n/${lang}.json`,'utf8')) as Record<string,string>;
const placeholders=(text:string)=>(text.match(/\{[a-z_]+\}/g)??[]).sort();
let root: ReturnType<typeof createRoot>|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;document.body.replaceChildren();localStorage.clear();vi.unstubAllGlobals();setNotificationLanguage('',null);state.language='hi';});

describe('notification templates',()=>{
 it.each(languages)('%s has every template with exactly the same placeholders, ready for the static cache',lang=>{
  const file=words(lang),loaded=readTranslationCache(JSON.stringify(file),lang);
  for(const key of Object.values(notificationTemplates)){
   expect(file[key],key).toBeTruthy();expect(placeholders(file[key]),key).toEqual(placeholders(key));
   expect(loaded[key],key).toBe(file[key]);
   const values=Object.fromEntries(placeholders(key).map(p=>[p.slice(1,-1),'DATA']));
   expect(renderNotification({key,values},loaded)).not.toMatch(/\{[a-z_]+\}/);
  }
  for(const key of ['Your team','Your admin','Your supervisor','System','your job','some days','your days'])expect(loaded[key],key).toBeTruthy();
 });
 it.each(languages)('%s older return notices can render in the current language immediately',lang=>{
  for(const kind of ['cant_fix','no_access','part_booked'] as const){
   const body=returnVisitLine(lang,kind,'2026-10-22T10:00:00Z','Asia/Dubai');
   const descriptor=notificationTemplate({kind:'job_next_step',job_step_body:body});
   expect(descriptor.key).toBe(notificationTemplates[kind]);
   expect(renderNotification(descriptor,words('zh-CN'))).not.toContain('technician');
  }
  const descriptor=notificationTemplate({kind:'job_next_step',job_step_body:statusLine(lang,'done',12,'Replace tap').body});
  expect(descriptor.key).toBe(notificationTemplates.done);expect(descriptor.values).toEqual({n:'12',job:'Replace tap'});
 });
 it('fills reordered and repeated placeholders once without interpreting user data',()=>{
  const message={key:notificationTemplates.assigned,values:{name:'Sam $&',job:'Tap {name} <b>test</b>'}};
  const result=renderNotification(message,{[message.key]:'{job}: {name} / {name}'});
  expect(result).toBe('Tap {name} <b>test</b>: Sam $& / Sam $&');
  expect(renderNotification(message)).toBe('Sam $& assigned Tap {name} <b>test</b> to you.');
  const html=renderToStaticMarkup(<NotificationMessage message={message} words={words('hi')}/>);
  expect(html).toContain('data-no-translate');expect(html).toContain('<bdi');expect(html).toContain('&lt;b&gt;test&lt;/b&gt;');
 });
 it('uses templates for known kinds and decisions, including missing statuses',()=>{
  const kinds=['company_join_accepted','team_message','message_received','on_the_way','client_callback','job_cancelled','job_assigned','job_reported','roles_changed','suggestion_received','suggestion_decided','status_changed','quote_sent','quote_decided','visit_confirmed','leave_requested','leave_decided','comment_added','job_unassigned','visit_changed','request_created','low_rating'];
  const seen=new Set<string>();
  for(const kind of kinds)for(const to_status of [undefined,'internal','approved','declined','done'])for(const from_status of [undefined,'open']){
   const template=notificationTemplate({kind,to_status,from_status,actor_name:'Sam',work_order_title:'Replace tap'});
   seen.add(template.key);expect(Object.values(notificationTemplates)).toContain(template.key);
   expect(renderNotification(template,words('hi'))).not.toMatch(/\{[a-z_]+\}/);
  }
  expect(seen.has(notificationTemplates.internal)).toBe(true);expect(seen.has(notificationTemplates.comment)).toBe(true);
  expect(seen.has(notificationTemplates.moved)).toBe(true);expect(seen.has(notificationTemplates.moved_to)).toBe(true);
 });
 it('translates status labels and system defaults but preserves names and historical job titles',()=>{
  const file=words('hi');
  const template=notificationTemplate({kind:'status_changed',actor_name:'Sam',work_order_title:'Original',current_title:'Renamed',from_status:'scheduled',to_status:'in_progress'},true);
  const output=renderNotification(template,file);
  expect(output).toContain('Original');expect(output).not.toContain('Renamed');
  expect(output).toBe(file[notificationTemplates.client_started].replace('{job}','Original'));
  expect(renderNotification(notificationTemplate({kind:'job_assigned'}),file)).toContain(file['Your team']);
  expect(renderNotification(notificationTemplate({kind:'roles_changed',actor_name:'Your admin'}),file)).toContain(file['Your admin']);
 });
 it('handles emergency data, saved return visits, older localized notices and day plans',()=>{
  for(const kind of ['emergency','emergency_review']){
   const work_order_title=kind==='emergency'?'Emergency reported by Sam: Water {job}':'Sam reported a false alarm. Should the emergency job be cancelled? He said: Water {job}';
   const descriptor=notificationTemplate({kind,actor_name:'Sam',work_order_title});
   expect(descriptor.key).toBe(notificationTemplates[kind as 'emergency']);
   expect(renderNotification(descriptor,words('ur'))).toContain('Water {job}');
  }
  for(const kind of ['cant_fix','no_access','part_booked','done'] as const){
   const saved={key:notificationTemplates[kind],values:{time:'10:00',n:'12',job:'Replace tap'}};
   const body=kind==='done'?statusLine('en','done',12,'Replace tap').body:returnVisitLine('en',kind,'2026-10-22T10:00:00Z','Asia/Dubai');
   expect(notificationTemplate({kind:'job_next_step',job_step_body:body}).key).toBe(saved.key);
   expect(renderNotification(saved,words('zh-CN'))).not.toContain(saved.key);
  }
  expect(renderNotification(notificationTemplate({kind:'job_next_step',job_step_body:'पहले से अनुवादित'}),words('hi'))).toBe('पहले से अनुवादित');
  expect(notificationTemplate({kind:'day_plan',job_step_body:notificationTemplates.day_ready}).key).toBe(notificationTemplates.day_ready);
  const parts=notificationParts(notificationTemplate({kind:'leave_requested'}),words('hi'));
  expect(parts.find(p=>p.parameter==='job')?.text).toBe(words('hi')['some days']);
 });
 it('leaves unknown bodies available to runtime translation while protecting names and titles',()=>{
  for(const kind of ['job_next_step','day_plan','future_kind']){
   const descriptor=notificationTemplate({kind,actor_name:'Sam (A)',work_order_title:'Tap [2]',job_step_body:'Sam (A) checked Tap [2] again.'});
   expect(descriptor.runtime).toBe(true);
   const container=document.createElement('div');
   container.innerHTML=renderToStaticMarkup(<NotificationMessage message={descriptor} words={words('hi')}/>);
   expect(container.textContent).toBe('Sam (A) checked Tap [2] again.');
   expect(container.firstElementChild?.hasAttribute('data-no-translate')).toBe(false);
   expect([...container.querySelectorAll('[data-no-translate]')].map(node=>node.textContent)).toEqual(['Sam (A)','Tap [2]']);
  }
  const unknownEmergency=notificationTemplate({kind:'emergency',actor_name:'Sam',work_order_title:'Sam raised an unfamiliar alert.'});
  expect(unknownEmergency.runtime).toBe(true);
  expect(unknownEmergency.values).not.toHaveProperty('job');
  const emergency=notificationTemplate({kind:'emergency',work_order_title:'Emergency reported by Sam: Water leak'});
  expect(emergency.values.name).toBe('Sam');
  expect(emergency.translatedValues).not.toContain('name');
 });
 it.each(['hi','ur','zh-CN','ar-AE'])('%s first message paint uses the file and never asks the runtime translation service',async lang=>{
  state.language=lang;
  const descriptor=notificationTemplate({kind:'job_assigned',actor_name:'Sam',work_order_title:'Replace washroom tap'});
  state.items=[0,1,2].map(i=>({id:String(i),message:renderNotification(descriptor),message_template:descriptor,created_at:new Date().toISOString(),read_at:null,link_target:{entity:'work_orders',id:'job'}}));
  let resolveFile!:(r:Response)=>void;
  const fileRequest=new Promise<Response>(resolve=>{resolveFile=resolve;});
  const fetch=vi.fn((_input: RequestInfo | URL)=>fileRequest);vi.stubGlobal('fetch',fetch);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const container=document.createElement('div');document.body.append(container);root=createRoot(container);
  await act(async()=>{root!.render(<><Translator/><Notifications open onClose={()=>{}} ws="workspace" onChange={()=>{}}/></>);});
  expect(container.querySelector('[data-loading]')).not.toBeNull();expect(container.textContent).not.toContain('assigned');
  await act(async()=>{resolveFile(new Response(JSON.stringify(words(lang))));await fileRequest;});
  const text=renderNotification(descriptor,words(lang));
  expect(container.querySelectorAll('details .activity-link')).toHaveLength(2);
  expect(container.textContent).toContain(text);expect(container.textContent).toContain(renderNotification({key:notificationTemplates.more_many,values:{count:'2'}},words(lang)));
  expect(container.textContent).not.toContain('assigned Replace');
  for(const span of container.querySelectorAll('bdi'))expect(span.closest(TRANSLATION_SKIP)).not.toBeNull();
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,350));});
  expect(fetch.mock.calls.map(call=>call[0])).toEqual([`/i18n/${lang}.json`]);
  // A language switch hides the old messages until the next file resolves.
  await act(async()=>{changeAppLanguage('en-IN');});
  expect(container.textContent).toContain('Sam assigned Replace washroom tap to you.');
 });
});

it.each(['en-IN','ar-AE'])('%s keeps real client updates visible above grouped details when a newer demo push exists',async lang=>{
 state.language=lang;
 const source={work_order_title:'Repair stairwell handrail',entity_id:'job',scheduled_for:'2032-01-12T07:15:00Z',timezone:'Asia/Dubai',after_photos:2};
 const file=lang==='en-IN'?{}:words(lang);
 document.documentElement.lang=lang;
 setNotificationLanguage(lang,file);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);
 for(const [kind,to_status] of [['on_the_way',null],['status_changed','scheduled'],['status_changed','done'],['quote_sent',null],['price_change',null]] as const){
  const real=notificationTemplate({...source,kind,to_status,details:{state:'pending'}},true);
  const demo=notificationTemplate({...source,kind:'demo_push'},true);
  const item=(id:string,kind:string,descriptor:typeof real)=>({id,kind,message:renderNotification(descriptor),message_template:descriptor,created_at:new Date().toISOString(),read_at:null,link_target:{entity:'work_orders',id:'job'}});
  state.items=[item('demo','demo_push',demo),item('real',kind,real),item('older','status_changed',notificationTemplate({...source,kind:'status_changed',to_status:'open'},true))];
  // Remount so the bell loads the next client step from its resource.
  await act(async()=>{root!.render(<Notifications key={kind+to_status} open onClose={()=>{}} ws="workspace" onChange={()=>{}}/>);});
  const links=[...container.querySelectorAll('.notification-item > .activity-link')];
  expect(links.map(link=>link.textContent)).toEqual([renderNotification(demo,file,lang),renderNotification(real,file,lang)]);
  expect(container.querySelectorAll('details .activity-link')).toHaveLength(1);
  expect(links.every(link=>link.getAttribute('href')==='/work-orders/job'||link.getAttribute('href')==='/work-orders/job#photos')).toBe(true);
 }
 document.documentElement.lang='en-IN';
});

it('Arabic client sentences render from files with company time and protected job names',()=>{
 document.documentElement.lang='ar-AE';
 const source={work_order_title:'Repair tap',entity_id:'job',scheduled_for:'2032-01-12T07:15:00Z',timezone:'Asia/Dubai',after_photos:3};
 const file=words('ar-AE');
 for(const [kind,to_status,key] of [['status_changed','scheduled','client_booked'],['on_the_way',null,'client_way'],['status_changed','in_progress','client_started'],['status_changed','done','client_done'],['visit_changed',null,'client_rescheduled'],['job_cancelled',null,'client_cancelled'],['quote_sent',null,'client_price']] as const){
  const message=notificationTemplate({...source,kind,to_status},true);
  expect(message.key).toBe(notificationTemplates[key]);
  const html=renderToStaticMarkup(<NotificationMessage message={message} words={file}/>);
  const host=document.createElement('div');host.innerHTML=html;
  expect(host.textContent).toMatch(/[ا-ي]/);
  expect(host.textContent).not.toMatch(/Your |technician|after photos|Jan|booked|cancelled|approval|2032-01/);
  expect(host.querySelector('span[data-no-translate]')).not.toBeNull();
  expect(host.textContent).toContain('Repair tap');
  if(key==='client_booked'||key==='client_rescheduled')expect(host.textContent).toContain('11:15');
  if(key==='client_done'){expect(host.textContent).toContain('3');expect(message.photoLink).toBe('/work-orders/job#photos');}
 }
 document.documentElement.lang='en-IN';
});

it.each([false,true])('an unavailable Arabic file uses saved translations or waits, with saved file %s',async saved=>{
 state.language='ar-AE';
 const descriptor=notificationTemplate({kind:'on_the_way',work_order_title:'Repair tap'},true);
 state.items=[{id:'notice',message:'The technician is on the way for Repair tap.',message_template:descriptor,created_at:new Date().toISOString(),read_at:null,link_target:{entity:'work_orders',id:'job'}}];
 localStorage.clear();
 if(saved)localStorage.setItem('groundwork-ui-translations:v1:ar-AE',JSON.stringify(words('ar-AE')));
 vi.stubGlobal('fetch',vi.fn(async()=>new Response('',{status:503})));
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>{root!.render(<><Translator/><Notifications open onClose={()=>{}} ws="workspace" onChange={()=>{}}/></>);});
 expect(container.textContent).not.toContain('The technician');
 if(saved)expect(container.textContent).toContain('الفني في الدرب عشان Repair tap.');
 else expect(container.querySelector('[data-loading]')).not.toBeNull();
});

it('CMP08 opening the grouped row marks every loaded member read and retains other jobs',async()=>{
 state.language='en-IN';
 setNotificationLanguage('en-IN',{});
 vi.mocked(post).mockClear();
 vi.mocked(post).mockResolvedValue({});
 const descriptor=notificationTemplate({kind:'comment_added',actor_name:'Sam',work_order_title:'Repair tap'});
 const item=(id:string,job='job')=>({id,kind:'comment_added',message:renderNotification(descriptor),message_template:descriptor,created_at:'2032-01-12T10:00:00Z',read_at:null,link_target:{entity:'work_orders',id:job}});
 state.items=[item('newest'),item('other','other-job'),item('older'),item('oldest')];
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const onChange=vi.fn(),onClose=vi.fn();
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>{root!.render(<Notifications open onClose={onClose} ws="workspace" onChange={onChange}/>);});
 expect(container.querySelectorAll('.notification-item')).toHaveLength(2);
 const group=container.querySelector('.notification-item')!;
 expect(group.querySelector('summary')?.textContent).toBe('2 more updates on this job');
 expect(group.querySelectorAll('details .activity-link')).toHaveLength(2);
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(2);
 await act(async()=>{group.querySelector<HTMLAnchorElement>(':scope > .activity-link')!.click();});
 expect(vi.mocked(post).mock.calls.map(([url])=>url)).toEqual([
  '/api/workspaces/workspace/notifications/read',
 ]);
 expect(post).toHaveBeenCalledWith('/api/workspaces/workspace/notifications/read',{ids:['newest','older','oldest']});
 expect(onChange.mock.calls).toEqual([[-1],[-1],[-1]]);
 expect(onClose).toHaveBeenCalledOnce();
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(1);
 expect(container.querySelector('.notification-item.unread details')).toBeNull();
});

it('CMP08 repeated emergency alerts stay as individual visible rows without a collapsed count',async()=>{
 state.language='en-IN';
 setNotificationLanguage('en-IN',{});
 const descriptor=notificationTemplate({kind:'emergency',actor_name:'Sam',work_order_title:'Emergency reported by Sam: Water leak'});
 state.items=['newest','older','oldest'].map(id=>({id,kind:'emergency',message:renderNotification(descriptor),message_template:descriptor,created_at:'2032-01-12T10:00:00Z',read_at:null,link_target:{entity:'work_orders',id:'job'}}));
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);
 await act(async()=>{root!.render(<Notifications open onClose={()=>{}} ws="workspace" onChange={()=>{}}/>);});
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(3);
 expect(container.querySelectorAll('.notification-item > .activity-link')).toHaveLength(3);
 expect(container.querySelector('details')).toBeNull();
});


it.each(['row','selection','open','read lead'] as const)('CMP08 %s optimistically reads one batch and rolls back on failure',async action=>{
 state.language='en-IN';setNotificationLanguage('en-IN',{});
 const item=(id:string,job='job',read=false)=>({id,kind:'comment_added',message:'Update',created_at:'2032-01-12T10:00:00Z',read_at:read?'2032-01-12T11:00:00Z':null,link_target:{entity:'work_orders',id:job}});
 state.items=[item('lead','job',action==='read lead'),item('older'),item('second','second-job'),item('second-older','second-job'),item('other','other-job')];
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.mocked(post).mockReset();
 let resolve!:()=>void,reject!:(e:Error)=>void;
 vi.mocked(post).mockImplementation(()=>new Promise((yes,no)=>{resolve=()=>yes({});reject=no;}));
 const container=document.createElement('div');document.body.append(container);root=createRoot(container);
 const onChange=vi.fn(),onClose=vi.fn();
 await act(async()=>{root!.render(<Notifications open ws="workspace" onClose={onClose} onChange={onChange}/>);});
 async function trigger(){
  await act(async()=>{
   if(action==='selection'){
    const marks=container.querySelectorAll<HTMLButtonElement>('.selection-mark');marks[0].click();marks[1].click();
   }
  });
  await act(async()=>{
   if(action==='selection')[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Mark read')!.click();
   else if(action==='row')container.querySelector<HTMLButtonElement>('.notification-read-toggle')!.click();
   else container.querySelector<HTMLAnchorElement>('.notification-item > .activity-link')!.click();
  });
 }
 const ids=action==='selection'?['lead','older','second','second-older']:['lead','older'];
 const initialUnread=action==='read lead'?2:3;
 await trigger();
 expect(post).toHaveBeenCalledExactlyOnceWith('/api/workspaces/workspace/notifications/read',{ids});
 const changed=ids.length-(action==='read lead'?1:0);
 expect(onChange.mock.calls).toEqual(Array.from({length:changed},()=>[-1]));
 expect(onClose).not.toHaveBeenCalled();
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(action==='selection'?1:2);
 expect(container.querySelector('.notification-read-toggle')?.textContent).toBe('Mark as unread');
 await act(async()=>{reject(new Error('Failed'));});
 expect([...container.querySelectorAll('[role="alert"]')].map(alert=>alert.textContent)).toContain('We could not update this notification. Your change was undone. Try again.');
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(initialUnread);
 expect(onChange.mock.calls).toEqual([...Array.from({length:changed},()=>[-1]),...Array.from({length:changed},()=>[1])]);
 expect(onClose).not.toHaveBeenCalled();
 onChange.mockClear();
 // Retry the same action and confirm every affected member contributes to the badge.
 vi.mocked(post).mockClear();
 if(action==='selection')await act(async()=>{[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent==='Mark read')!.click();});
 else await trigger();
 expect(onChange.mock.calls).toEqual(Array.from({length:changed},()=>[-1]));
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(action==='selection'?1:2);
 expect(onClose).not.toHaveBeenCalled();
 await act(async()=>{resolve();});
 expect(post).toHaveBeenCalledExactlyOnceWith('/api/workspaces/workspace/notifications/read',{ids});
 expect(onChange.mock.calls).toEqual(Array.from({length:ids.length-(action==='read lead'?1:0)},()=>[-1]));
 expect(container.querySelectorAll('.notification-item.unread')).toHaveLength(action==='selection'?1:2);
 if(action==='open'||action==='read lead')expect(onClose).toHaveBeenCalledOnce();
});
