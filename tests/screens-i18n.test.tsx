// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Settings } from '../components/app/settings';
import { CompanyMemory } from '../components/app/company-memory';
import { SuggestedJobs } from '../components/app/suggestions';
import { DEMO_MEMORY_COPY } from '../lib/demo-memory-copy';
import { JobChecklistCard } from '../components/app/job-checklists';
import { PriceChangeCard } from '../components/app/price-change';
import { QuoteVisit } from '../components/app/quote-visit';
import { Translator } from '../components/app/translator';
import { AppContext } from '../components/app/context';
import { DEMO_JOB_TITLES, DEMO_JOB_COMMENTS, demoJobDescription, demoJobTranslations } from '../lib/demo-job-copy';
import { clientStatusLabel, clientStatusLabels } from '../lib/ui/work-orders';
import { StatusBadge } from '../components/ui';
import { DEMO_QUOTE_COPY } from '../lib/demo-quote-copy';
import { DEMO_PROOF_COPY } from '../lib/demo-proof-copy';
import { LANGUAGES } from '../lib/languages';
import { CHECKLIST_DEFAULTS } from '../lib/job-checklists';
import { PRICE_HOLD, priceChangeLabel, type PriceChange } from '../lib/price-change';
import { isEnglish, readTranslationCache, TRANSLATION_ATTRIBUTES, TRANSLATION_SKIP, translationSource } from '../lib/i18n';

// Parse the installed Next version's JSX grammar so hidden dialogs and error states are covered too.
const {parse}=createRequire(import.meta.url)('next/dist/compiled/babel/parser');
const state=vi.hoisted(()=>({tab:'profile',lang:'en-IN',role:'admin',demo:true,owner:true}));
vi.mock('next/navigation',()=>({useRouter:()=>({replace:vi.fn()}),useSearchParams:()=>new URLSearchParams({tab:state.tab})}));
vi.mock('../components/ui/theme',()=>({useTheme:()=>({theme:'light',setTheme:vi.fn(),sync:vi.fn(),saving:false})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string)=>React.useMemo(()=>({data:
 url==='/api/me/preferences'?{language:state.lang,email_notifications:true,timezone:'Asia/Dubai'}:
 url.endsWith('/company-memory')?{data:Object.values(DEMO_MEMORY_COPY).map((body,index)=>({id:String(index),body,recorded_by:['Ravi','Sam','Imran'][index],created_at:'2026-10-12T08:00:00.000Z',context_uses:[8,5,3][index]})),can_edit:state.role==='admin'}:
 url.endsWith('/suggestions')?{data:[{id:'quote',title:DEMO_QUOTE_COPY.title,problem:DEMO_QUOTE_COPY.problem,sender_name:'Pranav Menon',source:'client',created_at:new Date().toISOString(),site_name:'Marina Exchange',status:'pending',photo_ids:[]}],pending_count:1}:
 url.endsWith('/checklist')?{steps:[{name:'Clean the filter',done:true}],materials:[{id:'material',name:'Capacitor',quantity:2,note:'Used during the visit'}],editable:true}:
 url.endsWith('/checklists')?{ac:['Clean the filter']}:
 url.endsWith('/settings')?{name:'Ridgeline',timezone:'Asia/Dubai',country:'AE',region:'Dubai',currency:'AED',approval_mode:'important',role_names:{},owner_handover:[],enabled_roles:['admin','staff','technician','client'],enabled_trades:['ac','plumbing','electrical'],enabled_dashboards:['overview','work'],company_size:'small'}:
 url.endsWith('/visit-charge')?{amount:150,regions:{},sample:true}:[],loading:false,error:null,reload:vi.fn(),setData:vi.fn()}),[url,state.lang])}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);state.tab='profile';state.role='admin';state.demo=true;state.owner=true;state.lang='en-IN';localStorage.clear();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
function provider(children:React.ReactNode){
 const member={workspace_id:'company',workspace_name:'Ridgeline',role:state.role,is_owner:state.owner&&state.role==='admin',client_id:null,client_name:null};
 const context={member,workspace:{id:'company',name:'Ridgeline',is_demo:state.demo,country:'AE',currency:'AED',timezone:'Asia/Dubai'},me:{user:{id:'imran',name:'Imran',email:null,image:null,is_demo:state.demo},memberships:[member]},reload:vi.fn(),updateName:vi.fn()};
 return <AppContext.Provider value={context as any}>{children}</AppContext.Provider>;
}
const job={id:'job',status:'in_progress',scheduled_for:null,quote_status:'pending',quote_amount:850,quote_note:DEMO_QUOTE_COPY.note,price_change:{state:'pending' as const,words:DEMO_QUOTE_COPY.finding,technician_name:'Ravi'}};
function demoJobs(){return <><h1 data-no-translate>{DEMO_JOB_TITLES[6]}</h1><p data-no-translate>{demoJobDescription(1)}</p>{Object.values(DEMO_JOB_COMMENTS).map(copy=><p key={copy} data-no-translate>{copy}</p>)}<p data-no-translate>Pranav Menon</p><p data-no-translate>Al Marsa Street</p></>;}
function cards(){return <>{Object.values(clientStatusLabels).map(label=><StatusBadge key={label} status="in_progress">{label}</StatusBadge>)}<StatusBadge status="in_progress">{clientStatusLabel(job)}</StatusBadge><PriceChangeCard base="/company" job={job} reload={()=>{}}/><QuoteVisit base="/company" o={job} client={state.role==='client'} office={state.role==='admin'} currency="AED" reload={()=>{}}/><JobChecklistCard base="/company" id="job" readOnly={state.role==='client'}/></>;}
function screenKeys(){
 const keys=new Set<string>(),walker=document.createTreeWalker(host,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);
 let node:Node|null;
 while((node=walker.nextNode())){
  if(node instanceof Text){const source=translationSource(node.data);if(!source)continue;const element=node.parentElement;
   if(element?.closest(TRANSLATION_SKIP)&&!(state.demo&&DEMO_PROOF_COPY.has(source)))continue;
   keys.add(source);
  }else if(node instanceof Element&&!node.closest(TRANSLATION_SKIP.replace('textarea,',''))){for(const attr of TRANSLATION_ATTRIBUTES){const source=translationSource(node.getAttribute(attr)??'');if(source)keys.add(source);}}
 }
 return keys;
}
it('Settings and job cards have usable static words in every app language, without English fallback',async()=>{
 const keys=new Set<string>();
 for(const role of ['admin','staff','technician','client']){state.role=role;
  for(const tab of ['profile','company','checklists','appearance','history','notifications','help','members']){state.tab=tab;await act(async()=>root.render(provider(<Settings/>)));screenKeys().forEach(k=>keys.add(k));}
  await act(async()=>root.render(provider(cards())));screenKeys().forEach(k=>keys.add(k));
 }
 // These are identity, language choices and formatting, not interface words.
 const data=new Set(['Ridgeline','Imran','English (India)','Asia/Dubai (UTC+4)','Asia/Dubai','United Arab Emirates','Dubai','AED','WO']);
 // Scan branches that require errors, saved state, confirmations or other device capabilities.
 const languages=LANGUAGES.filter(l=>!isEnglish(l.code));
 const known=new Set(languages.flatMap(l=>Object.keys(JSON.parse(readFileSync(`public/i18n/${l.code}.json`,'utf8')))));
 for(const file of ['settings','price-change','job-checklists','quote-visit','visit-charge-settings','company-options','settings-invites','push-settings','help-feedback']){
  const ast=parse(readFileSync(`components/app/${file}.tsx`,'utf8'),{sourceType:'module',plugins:['jsx','typescript']});
  function scan(node:any,parent?:any){
   if(!node||typeof node!=='object')return;
   if(node.type==='JSXText'){const text=node.value.replace(/\s+/g,' ').trim();if(/\p{L}/u.test(text))keys.add(text);}
   if(node.type==='StringLiteral'&&(known.has(node.value)||/^[A-Z][A-Za-z0-9 ,.!?…’'()]+ [A-Za-z0-9 ,.!?…’'()]*$/.test(node.value)||(parent?.type==='JSXAttribute'&&['label','placeholder','aria-label','title','confirmLabel','message'].includes(parent.name.name))))keys.add(node.value);
   for(const [key,value] of Object.entries(node)){if(key==='loc')continue;if(Array.isArray(value))value.forEach(child=>scan(child,node));else if(value&&typeof value==='object')scan(value,node);}
  }
  scan(ast);
 }
 DEMO_PROOF_COPY.forEach(key=>keys.add(key));
 Object.values(CHECKLIST_DEFAULTS).flat().forEach(key=>keys.add(key));
 keys.add(PRICE_HOLD);
 for(const state of ['waiting_price','pending','approved','declined','refused'] as PriceChange['state'][])keys.add(priceChangeLabel({...job.price_change,state}));
 const missing:string[]=[];
 for(const {code} of LANGUAGES){if(isEnglish(code))continue;
  const dictionary=readTranslationCache(readFileSync(`public/i18n/${code}.json`,'utf8'),code);
  Object.assign(dictionary,demoJobTranslations(dictionary));
  for(const key of keys){if(data.has(key)||!/\p{L}/u.test(key))continue;const translated=dictionary[key];
   if(!translated||! /\p{L}/u.test(translated)||translated===key||/\u200b|\bagent\b/i.test(translated))missing.push(`${code}: ${key}`);
  }
 }
 expect(missing).toEqual([]);
});
it.each([true,false].flatMap(demo=>[false,true].map(cached=>({demo,cached}))))('translates only exact seeded job words in demo mode: $demo, cached: $cached',async({demo,cached})=>{
 state.demo=demo;state.lang='ar-AE';state.role='client';
 const dictionary=readFileSync('public/i18n/ar-AE.json','utf8');
 if(cached)localStorage.setItem('groundwork-ui-translations:v1:ar-AE',dictionary);
 const fetcher=vi.fn(async(url:string)=>({ok:true,text:async()=>dictionary,json:async()=>({translations:{}})}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>{root.render(provider(<>{cards()}{demoJobs()}<p data-no-translate>My own repair note</p><textarea defaultValue={DEMO_QUOTE_COPY.finding}/><Translator/></>));});
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,200));});
 const words=JSON.parse(dictionary);Object.assign(words,demoJobTranslations(words));
 expect(host.textContent).toContain(demo?words[DEMO_QUOTE_COPY.finding]:DEMO_QUOTE_COPY.finding);
 expect(host.textContent).toContain(demo?words[DEMO_QUOTE_COPY.note]:DEMO_QUOTE_COPY.note);
 expect(host.textContent).toContain(demo?words['Used during the visit']:'Used during the visit');
 for(const key of [DEMO_JOB_TITLES[6],demoJobDescription(1),...Object.values(DEMO_JOB_COMMENTS)])expect(host.textContent).toContain(demo?words[key]:key);
 expect(host.textContent).toContain('Pranav Menon');expect(host.textContent).toContain('Al Marsa Street');
 expect(host.textContent).toContain('My own repair note');expect(host.querySelector('textarea')?.value).toBe(DEMO_QUOTE_COPY.finding);
 expect(fetcher.mock.calls.filter(([url])=>url==='/api/i18n/translate').length).toBe(0);
});

it.each(LANGUAGES.flatMap(({code})=>['admin','staff','technician','client'].map(role=>({code,role}))))('renders $role Settings and job cards in $code from shipped words',async({code,role})=>{
 state.lang=code;state.role=role;state.tab='appearance';
 const raw=isEnglish(code)?'{}':readFileSync(`public/i18n/${code}.json`,'utf8');
 const dictionary=JSON.parse(raw);Object.assign(dictionary,demoJobTranslations(dictionary));
 const fetcher=vi.fn(async()=>({ok:true,text:async()=>raw,json:async()=>({translations:{}})}));vi.stubGlobal('fetch',fetcher);
 await act(async()=>root.render(provider(<><Settings/>{cards()}{demoJobs()}<p data-no-translate>My own repair note</p><Translator/></>)));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,150));});
 for(const key of ['Settings','Agent','Price changed','Technician statement','Checklist',DEMO_QUOTE_COPY.finding,DEMO_QUOTE_COPY.note,'Capacitor','Used during the visit','Waiting for the client',...Object.values(clientStatusLabels),DEMO_JOB_TITLES[6],demoJobDescription(1),...Object.values(DEMO_JOB_COMMENTS)]){
  expect(host.textContent,`${code}: ${key}`).toContain(isEnglish(code)?key:dictionary[key]);
 }
 for(const key of ['Waiting for the client','Price changed','Work in Progress',DEMO_JOB_TITLES[6],demoJobDescription(1),...Object.values(DEMO_JOB_COMMENTS)])if(!isEnglish(code))expect(host.textContent,`${code}: English fallback for ${key}`).not.toContain(key);
 expect(host.textContent).toContain('Pranav Menon');expect(host.textContent).toContain('Al Marsa Street');
 expect(host.textContent).toContain('Ravi');expect(host.textContent).toContain('My own repair note');
 // A missing static entry must not be rescued by a runtime translation request.
 expect(fetcher.mock.calls.length).toBe(isEnglish(code)?0:1);
});

it.each(LANGUAGES.flatMap(({code})=>['owner','admin','supervisor'].map(viewer=>({code,viewer}))))('renders seeded Company Memory and dashboard quote requests for $viewer in $code',async({code,viewer})=>{
 state.lang=code;state.role=viewer==='supervisor'?'staff':'admin';state.owner=viewer==='owner';
 const raw=isEnglish(code)?'{}':readFileSync(`public/i18n/${code}.json`,'utf8'),words=JSON.parse(raw);
 const fetcher=vi.fn(async(_url:string,_options?:RequestInit)=>({ok:true,text:async()=>raw,json:async()=>({translations:{}})}));vi.stubGlobal('fetch',fetcher);
 vi.stubGlobal('innerWidth',360);
 await act(async()=>root.render(provider(<><CompanyMemory/><SuggestedJobs summary/><Translator/></>)));
 await act(async()=>{await new Promise(resolve=>setTimeout(resolve,150));});
 for(const key of [...Object.values(DEMO_MEMORY_COPY),DEMO_QUOTE_COPY.title,DEMO_QUOTE_COPY.problem]){
  expect(host.textContent,`${code}: ${key}`).toContain(isEnglish(code)?key:words[key]);
  if(!isEnglish(code))expect(host.textContent).not.toContain(key);
 }
 const memory=host.querySelector('.company-memory')!;
 expect(memory.textContent).toContain('Ravi');expect(memory.textContent).toContain('2026-10-12');
 expect(Array.from(memory.querySelectorAll('dd[data-no-translate]')).map(el=>el.textContent)).toEqual(['8','5','3']);
 const buttons=Array.from(memory.querySelectorAll('button')).map(button=>button.textContent);
 for(const label of ['Edit','Delete']){
  if(viewer==='supervisor')expect(buttons).toHaveLength(0);
  else expect(buttons).toContain(isEnglish(code)?label:words[label]);
 }
 expect(host.textContent).toContain('Pranav Menon');expect(host.textContent).toContain('Marina Exchange');
 expect(fetcher.mock.calls.filter(([url])=>url.startsWith('/i18n/')).length).toBe(isEnglish(code)?0:1);
 // RelativeTime may request unrelated date labels; fixture text must come from the file.
 const requested=fetcher.mock.calls.filter(([url])=>url==='/api/i18n/translate').flatMap(([,options])=>JSON.parse(String(options?.body)).strings as string[]);
 for(const key of [...Object.values(DEMO_MEMORY_COPY),...Object.values(DEMO_QUOTE_COPY)])expect(requested).not.toContain(key);
});
