// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {afterEach, expect, it, vi} from 'vitest';
import {AppWords} from '../components/app/app-words';
import {PageSkeleton} from '../components/ui/states';
import {AppShell} from '../components/app/shell';
import {useApp} from '../components/app/context';

const mocks=vi.hoisted(()=>({request:vi.fn(),replace:vi.fn(),reload:()=>{}}));
vi.mock('next/navigation',()=>({usePathname:()=>'/dashboard',useRouter:()=>({replace:mocks.replace})}));
vi.mock('next/dynamic',()=>({default:()=>()=>null}));
vi.mock('../lib/ui/api',async importOriginal=>({...await importOriginal<typeof import('../lib/ui/api')>(),request:mocks.request}));
vi.mock('../lib/hooks/use-visible-poll',()=>({useVisiblePoll:()=>{}}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:null,reload:mocks.reload})}));
vi.mock('../components/app/translator',()=>({Translator:()=>null}));
vi.mock('../components/app/outbox',()=>({Outbox:()=>null}));

afterEach(()=>vi.unstubAllGlobals());

it.each(['hi','ar-AE'])('renders visible saved-language text in the root loading fallback for %s',language=>{
 const words=JSON.parse(readFileSync(`public/i18n/${language}.json`,'utf8'));
 const html=renderToStaticMarkup(<AppWords language={language} words={words}><PageSkeleton/></AppWords>);
 const host=document.createElement('div');host.innerHTML=html;
 expect(host.textContent).toContain(words['Loading page']);
 expect(host.textContent).not.toMatch(/Loading|Groundwork/);
 expect(host.querySelector('[data-translated-copy]')?.getAttribute('style')).toBeNull();
});

it('keeps the same screen mounted while identity reload is pending or fails, including a dropped route seed',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 Object.defineProperty(HTMLElement.prototype,'scrollTo',{value:()=>{},configurable:true});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const initial={user:'imran',me:{user:{id:'imran',name:'Imran',is_demo:true},memberships:[]},workspace:null,resources:{}} as any;
 let reload!:()=>Promise<void>;
 function Screen(){reload=useApp().reload as ()=>Promise<void>;return <p>आज के काम</p>;}
 const screen=(seed:any)=><AppShell initial={seed}><Screen/></AppShell>;
 try{
  await act(async()=>root.render(screen(initial)));
  const main=host.querySelector('main');expect(main?.textContent).toContain('आज के काम');
  let reject!:(e:Error)=>void;
  mocks.request.mockImplementation(()=>new Promise((_,r)=>{reject=r;}));
  let pending!:Promise<void>;
  await act(async()=>{pending=reload();});
  expect(host.querySelector('main')).toBe(main);
  await act(async()=>root.render(screen(null)));
  expect(host.querySelector('main')).toBe(main);
  await act(async()=>{reject(Error('temporary failure'));await pending;});
  expect(host.querySelector('main')).toBe(main);
  expect(document.documentElement.dataset.session).toBe('in');
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();}
});

it('still shows the workspace error when the first identity load fails',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:()=>{},removeEventListener:()=>{}}));
 vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 mocks.request.mockReset();mocks.request.mockRejectedValue(Error('down'));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<AppShell initial={null}><p>screen</p></AppShell>));
  expect(host.querySelector('[role=alert]')?.textContent).toContain('We couldn’t open Groundwork');
  expect(host.querySelector('main')).toBeNull();
 }finally{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();}
});
