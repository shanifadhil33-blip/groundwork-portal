// @vitest-environment jsdom
import React, {act} from 'react';
import {renderToStaticMarkup, renderToString} from 'react-dom/server';
import {createRoot, hydrateRoot} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {AppWords, Translated} from '../components/app/app-words';
import {Translator, changeAppLanguage} from '../components/app/translator';
import {ServerLangProvider, useUiLang} from '../components/app/use-ui-lang';
import {InitialResourceProvider} from '../components/app/initial-resources';
import {OwnerSummary, TodayJobs} from '../components/app/owner-today';
import {DayPlanView, type DayPlanData} from '../components/app/day-plan-card';
import {NeedsAction} from '../components/app/dashboard';
import {WaitingPrices} from '../components/app/price-change';
import {AppContext} from '../components/app/context';
import {LANGUAGES} from '../lib/languages';
import {demoJobDescription, DEMO_JOB_DESCRIPTION_TEMPLATE} from '../lib/demo-job-copy';
import {formatInLang} from '../lib/date-lang';
import {scanSource} from '../scripts/i18n-coverage-core';
const navigation=vi.hoisted(()=>({reload:vi.fn(),replace:vi.fn(),assign:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>navigation}));
const mocks=vi.hoisted(()=>({cookie:'hi',app:vi.fn<()=>Promise<any>>(async()=>null)}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:mocks.cookie})})}));
vi.mock('../lib/server-page-data',()=>({getAppPageData:mocks.app}));
import {getServerLanguage} from '../lib/server-language';
const context={workspace:{timezone:'Asia/Dubai'},me:{user:{id:'imran',name:'Imran'},memberships:[]}} as any;
const plan:DayPlanData={can_plan:true,demo:true,summary:'',fingerprint:'demo',lines:[{job_id:'demo',order:1,title:'Demo job',assignee_id:'imran',assignee_name:'Imran',hour:8,why:'Imran is free.',kind:'place'}],watch:[],visits:[{id:'demo',order:1,title:'Demo job'}],people:[{id:'imran',name:'Imran',away:null}]};
function date(){return formatInLang('2026-10-30T12:00:00Z',{weekday:'long',month:'long',timeZone:'UTC'},useUiLang());}
function Screen(){return <Translated><h1>Company overview</h1><p data-no-translate>{date()}</p><OwnerSummary base="/demo"/><DayPlanView data={plan} busy="" error="" notice="" onApprove={()=>{}} onLate={()=>{}}/></Translated>;}
it.each([['hi','ltr'],['ar-AE','rtl'],['ur','rtl'],['en-IN','ltr']])('renders server words and dates for cookie %s',async(language,dir)=>{
 mocks.cookie=language;
 const result=await getServerLanguage();
 expect(result.language).toBe(language);expect(result.dir).toBe(dir);expect(Object.getPrototypeOf(result.words)).toBe(Object.prototype);
 const html=renderToStaticMarkup(<html lang={result.language} dir={result.dir}><body><AppWords {...result}><ServerLangProvider language={language}><AppContext.Provider value={context}><Screen/></AppContext.Provider></ServerLangProvider></AppWords></body></html>);
 expect(html).toContain(`lang="${language}"`);expect(html).toContain(`dir="${dir}"`);
 if(language==='en-IN')expect(html).toContain('Approve the plan');
 else {expect(html).toContain(result.words['Approve the plan']);expect(html).not.toMatch(/Company overview|Approve the plan|Friday|October/);}
});
it.each(['invalid','en','</script>'])('rejects invalid cookie %s',async cookie=>{mocks.cookie=cookie;expect((await getServerLanguage()).language).toBe('en-IN');});
it('renders neutral counts and no empty jobs claim before data arrives',()=>{
 const html=renderToStaticMarkup(<AppContext.Provider value={context}><OwnerSummary base="/demo"/><TodayJobs base="/demo"/></AppContext.Provider>);
 expect(html).not.toMatch(/>0<|No jobs today/);expect(html.match(/aria-busy="true"/g)).toHaveLength(4);
});
it.each(LANGUAGES.filter(l=>!l.code.startsWith('en')).map(l=>l.code))('%s has every card word saved',code=>{
 const words=JSON.parse(readFileSync(`public/i18n/${code}.json`,'utf8'));
 const keys=new Set(['Today\'s plan','Nothing is waiting for a morning plan.','No one else covers this trade.','has no room left today.','covers this trade.','is free.','is free to take it. Nothing is sent until you say yes.']);
 for(const file of ['owner-today','day-plan-card'])for(const key of scanSource(readFileSync(`components/app/${file}.tsx`,'utf8')).keys())keys.add(key);
 for(const key of keys)expect(words[key],`${code}: ${key}`).toBeTruthy();
});
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();document.body.innerHTML='';});
it('changes language in place while hiding the day plan until the file is ready',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const hrefChanged=vi.fn();
 Object.defineProperty(navigation,'href',{configurable:true,set:hrefChanged});
 vi.stubGlobal('location',navigation);
 const browserWindow = window;
 vi.stubGlobal('window',new Proxy(browserWindow,{get(target,key){if(key==='location')return navigation;const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;}}));
 let resolve!: (response:Response)=>void;
 const fetch=vi.fn((url:string)=>url.startsWith('/i18n/')?new Promise<Response>(r=>{resolve=r;}):Promise.resolve(new Response(JSON.stringify({translations:{}}))));
 vi.stubGlobal('fetch',fetch);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const content=<AppWords language="en-IN" words={{}}><ServerLangProvider language="en-IN"><AppContext.Provider value={context}><InitialResourceProvider resources={{'/api/me/preferences':{data:{language:'en-IN'}}}}><Translator/><Screen/></InitialResourceProvider></AppContext.Provider></ServerLangProvider></AppWords>;
 try{
 await act(async()=>root.render(content));
 await act(async()=>changeAppLanguage('hi'));
 expect(host.textContent).not.toMatch(/Approve the plan|Today|plan|jobs/);
 expect(host.querySelector('[aria-busy="true"]')).toBeTruthy();
 await act(async()=>{resolve(new Response(readFileSync('public/i18n/hi.json','utf8')));});
 expect(host.textContent).toContain(JSON.parse(readFileSync('public/i18n/hi.json','utf8'))['Approve the plan']);
 expect(document.documentElement.lang).toBe('hi');expect(document.cookie).toContain('gw-lang=hi');
 await act(async()=>changeAppLanguage('ur'));
 await act(async()=>{resolve(new Response(readFileSync('public/i18n/ur.json','utf8')));});
 expect(document.documentElement.dir).toBe('rtl');
 await act(async()=>changeAppLanguage('en-IN'));
 expect(host.textContent).toContain('Approve the plan');expect(document.documentElement.dir).toBe('ltr');
 for(const spy of Object.values(navigation))expect(spy).not.toHaveBeenCalled();
 expect(hrefChanged).not.toHaveBeenCalled();
 expect(fetch.mock.calls.every(([url])=>url.startsWith('/i18n/')||url==='/api/i18n/translate'||url.startsWith('/demo/'))).toBe(true);
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('hydrates translated text without replacing the page',async()=>{
 const words=JSON.parse(readFileSync('public/i18n/hi.json','utf8'));
 const content=<AppWords language="hi" words={words}><Translated><h1>Company overview</h1><button>Approve the plan</button></Translated></AppWords>;
 const host=document.createElement('div');document.body.append(host);host.innerHTML=renderToString(content);const before=host.innerHTML,recover=vi.fn();
 let root:ReturnType<typeof hydrateRoot>;
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 await act(async()=>{root=hydrateRoot(host,content,{onRecoverableError:recover});});
 expect(host.innerHTML).toBe(before);expect(recover).not.toHaveBeenCalled();
 await act(async()=>root!.unmount());host.remove();
});

vi.mock('next/font/google',()=>{
 const font=()=>({variable:'demo-font'});
 return Object.fromEntries(['Manrope','IBM_Plex_Sans_Arabic','Noto_Sans_Tamil','Noto_Sans_Malayalam','Noto_Sans_Devanagari','Noto_Sans_Bengali','Noto_Sans_Sinhala','Noto_Sans_SC','Noto_Sans_Ethiopic','Noto_Sans'].map(name=>[name,font]));
});
vi.mock('../components/ui/theme',()=>({ThemeProvider:({children}:{children:React.ReactNode})=>children}));
vi.mock('../components/ui/toast',()=>({ToastProvider:({children}:{children:React.ReactNode})=>children,useToast:()=>vi.fn()}));
vi.mock('../components/ui/request-recovery',()=>({RequestRecovery:()=>null}));
import Layout from '../app/layout';
it.each([['hi','ltr'],['ar-AE','rtl'],['ur','rtl'],['en-IN','ltr']])('root layout sends cookie %s and translated text in HTML',async(language,dir)=>{
 mocks.cookie=language;
 const html=renderToStaticMarkup(await Layout({children:<Translated><h1>Company overview</h1><button>Approve the plan</button></Translated>}));
 expect(html).toContain(`lang="${language}"`);expect(html).toContain(`dir="${dir}"`);
 if(language==='en-IN'){expect(html).toContain('Approve the plan');expect(html).not.toContain('data-translating');}
 else {const words=JSON.parse(readFileSync(`public/i18n/${language}.json`,'utf8'));expect(html).toContain(words['Approve the plan']);expect(html).not.toContain('Approve the plan');expect(html).not.toContain('data-translating');}
});

it('uses the signed in stored preference over a cookie from a previous account',async()=>{
 mocks.cookie='en-IN';
 mocks.app.mockResolvedValueOnce({resources:{'/api/me/preferences':{data:{language:'hi'}}}});
 expect((await getServerLanguage()).language).toBe('hi');
 mocks.app.mockResolvedValueOnce({resources:{'/api/me/preferences':{data:{language:null}}}});
 mocks.cookie='ur';
 expect((await getServerLanguage()).language).toBe('en-IN');
});

it('uses the server dictionary for exact demo descriptions without another language file request',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const words=JSON.parse(readFileSync('public/i18n/hi.json','utf8'));
 const fetch=vi.fn(async()=>new Response(JSON.stringify({translations:{}})));
 vi.stubGlobal('fetch',fetch);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
 await act(async()=>root.render(<AppWords language="hi" words={words}><AppContext.Provider value={{...context,workspace:{...context.workspace,is_demo:true}}}><InitialResourceProvider resources={{'/api/me/preferences':{data:{language:'hi'}}}}><Translator/><p data-no-translate>{demoJobDescription(1)}</p></InitialResourceProvider></AppContext.Provider></AppWords>));
 expect(host.textContent).toBe(words[DEMO_JOB_DESCRIPTION_TEMPLATE].replace('{number}','1'));
 expect(fetch.mock.calls).toHaveLength(0);
 }finally{await act(async()=>root.unmount());host.remove();}
});


it.each(['hi', 'ar-AE'])('settles missing words, codes and identity translations visibly in %s server HTML', language => {
 const words = {Known: language === 'hi' ? 'ज्ञात' : 'معروف', Groundwork: 'Groundwork'};
 const html = renderToStaticMarkup(<AppWords language={language} words={words}><Translated>
  <p>Known</p><p>Missing word</p><span className="order-number">WO 39</span><span className="initials">SA</span><p>Groundwork</p>
  <input placeholder="Missing hint" aria-label="Missing label"/><select><option>Missing option</option></select>
 </Translated></AppWords>);
 expect(html).toContain(words.Known);
 for (const source of ['Missing word', 'WO 39', 'SA', 'Groundwork', 'Missing hint', 'Missing label', 'Missing option']) expect(html).toContain(source);
 expect(html).not.toMatch(/visibility:hidden|aria-busy="true"|…/);
});

it.each(['loaded', 'http error', 'network error'] as const)('reveals pending missing words and WO 39 after a dictionary %s', async outcome => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 let resolve!: (response: Response) => void;
 let reject!: (error: Error) => void;
 vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((yes, no) => { resolve = yes; reject = no; })));
 const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
 try {
  await act(async () => root.render(<AppWords language="en-IN" words={{}}><Translated>
   <p>Known</p><p>Missing word</p><span className="order-number">WO 39</span>
   <input placeholder="Missing hint"/><select><option>Missing option</option></select>
  </Translated></AppWords>));
  await act(async () => changeAppLanguage('hi'));
  expect(host.querySelectorAll('[data-translated-copy][aria-busy="true"]')).toHaveLength(3);
  expect(host.textContent).not.toContain('Known');
  await act(async () => {
   if (outcome === 'network error') reject(new Error('offline'));
   else resolve(new Response(JSON.stringify({Known: 'ज्ञात', 'Missing word': null}), {status: outcome === 'http error' ? 503 : 200}));
  });
  expect(host.textContent).toContain(outcome === 'loaded' ? 'ज्ञात' : 'Known');
  expect(host.textContent).toContain('Missing word'); expect(host.querySelector('.order-number')?.textContent).toBe('WO 39');
  expect(host.querySelector('input')?.placeholder).toBe('Missing hint'); expect(host.querySelector('option')?.textContent).toBe('Missing option');
  expect(host.querySelector('[aria-busy="true"], [style*="visibility: hidden"]')).toBeNull();
 } finally { await act(async () => root.unmount()); host.remove(); }
});

it('ships the Hindi account mode and composer words for the first paint', () => {
 const words = JSON.parse(readFileSync('public/i18n/hi.json', 'utf8'));
 const html = renderToStaticMarkup(<AppWords language="hi" words={words}><Translated><button>Work</button><button>My home</button><label>Ask Agent</label><input placeholder="Ask Agent or speak"/></Translated></AppWords>);
 expect(html).toContain('काम'); expect(html).toContain('मेरा घर');
 expect(html).not.toMatch(/>Work<|>My home<|\bAgent\b|aria-busy="true"/);
});

// Exercise the real split string/number children, not a single "WO 39" literal.
function OrderLists({language, pending = false}: {language: string; pending?: boolean}) {
 const words = pending ? null : language === 'en-IN' ? {} : JSON.parse(readFileSync(`public/i18n/${language}.json`, 'utf8'));
 const job = {id:'job', order_number:39, title:'Fixture title', status:'open', quote_status:'pending'};
 return <AppWords language={language} words={words}><AppContext.Provider value={{...context, member:{role:'client',client_kind:'manager'}} as any}>
  <InitialResourceProvider resources={{
   '/demo/work-orders?active=true&sort=updated_at&dir=asc&pageSize=100':{data:{data:[job],total:1}},
   '/demo/waiting-prices':{data:[job]},
  }}><NeedsAction base="/demo" client/><WaitingPrices base="/demo"/></InitialResourceProvider>
 </AppContext.Provider></AppWords>;
}
it.each(['hi','ar-AE','en-IN'])('keeps split order identifiers visible in %s first HTML and hydration, even while words load', async language => {
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
 for (const pending of [false, true]) {
  const content = <OrderLists language={language} pending={pending}/>;
  const host = document.createElement('div'); document.body.append(host);
  host.innerHTML = renderToString(content);
  const check = () => {
   const numbers = [...host.querySelectorAll('.order-number')];
   expect(numbers).toHaveLength(2);
   for (const number of numbers) {
    expect(number.textContent).toBe('WO 39');
    expect(number.querySelector('[aria-busy="true"], [style*="visibility"]')).toBeNull();
   }
  };
  check();
  if (pending && language !== 'en-IN') expect(host.querySelector('h2 [aria-busy="true"]')).toBeTruthy();
  const recover = vi.fn(); let root!: ReturnType<typeof hydrateRoot>;
  try {
   await act(async () => {root = hydrateRoot(host, content, {onRecoverableError: recover});});
   check(); expect(recover).not.toHaveBeenCalled();
  } finally {if(root) await act(async () => root.unmount());host.remove();}
 }
});
