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
import { Translator, changeAppLanguage } from '../components/app/translator';
import { setNotificationLanguage } from '../components/app/notification-language';

const state=vi.hoisted(()=>({language:'hi',items:[] as unknown[]}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{language:state.language}})}));
vi.mock('../components/app/context',()=>({useApp:()=>({member:{role:'technician'},reload:vi.fn()})}));
vi.mock('../components/app/selection',()=>({useSelection:()=>({bar:null,row:()=>({}),mark:()=>null,close:()=>{}})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock('../lib/ui/api',()=>({request:async()=>({data:state.items,total:state.items.length,unread_count:state.items.length}),post:vi.fn()}));
vi.mock('../components/ui',()=>({
 BottomSheet:({children}:{children:React.ReactNode})=><div>{children}</div>,
 Button:({children}:{children:React.ReactNode})=><button data-no-translate>{children}</button>,
 RelativeTime:()=>null,Skeleton:()=> <span data-loading="true"/>,useToast:()=>()=>{},
 ErrorState:()=> <span>Error</span>,EmptyState:()=> <span>Empty</span>,
}));
const languages=readdirSync('public/i18n').map(file=>file.replace('.json',''));
const words=(lang:string)=>JSON.parse(readFileSync(`public/i18n/${lang}.json`,'utf8')) as Record<string,string>;
const placeholders=(text:string)=>(text.match(/\{[a-z_]+\}/g)??[]).sort();
let root: ReturnType<typeof createRoot>|undefined;
afterEach(async()=>{if(root)await act(async()=>root!.unmount());root=undefined;document.body.replaceChildren();vi.unstubAllGlobals();setNotificationLanguage('',null);state.language='hi';});

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
 it('uses templates for every kind and decision, including missing statuses and unknown future kinds',()=>{
  const kinds=['company_join_accepted','team_message','message_received','on_the_way','client_callback','job_cancelled','job_assigned','job_reported','roles_changed','suggestion_received','suggestion_decided','status_changed','quote_sent','quote_decided','visit_confirmed','leave_requested','leave_decided','comment_added','job_unassigned','visit_changed','request_created','day_plan','low_rating','future_kind'];
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
  expect(output).toContain('Sam');expect(output).toContain('Original');expect(output).not.toContain('Renamed');
  expect(output).toContain(file['Visit Scheduled']);expect(output).toContain(file['Work in Progress']);
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
   expect(notificationTemplate({kind:'job_next_step',message_template:saved})).toEqual(saved);
   expect(renderNotification(saved,words('zh-CN'))).not.toContain(saved.key);
  }
  expect(renderNotification(notificationTemplate({kind:'job_next_step',job_step_body:'पहले से अनुवादित'}),words('hi'))).toBe('पहले से अनुवादित');
  expect(notificationTemplate({kind:'day_plan',job_step_body:notificationTemplates.day_ready}).key).toBe(notificationTemplates.day_ready);
  const parts=notificationParts(notificationTemplate({kind:'leave_requested'}),words('hi'));
  expect(parts.find(p=>p.parameter==='job')?.text).toBe(words('hi')['some days']);
 });
 it.each(['hi','ur','zh-CN'])('%s first message paint uses the file and never asks the runtime translation service',async lang=>{
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
