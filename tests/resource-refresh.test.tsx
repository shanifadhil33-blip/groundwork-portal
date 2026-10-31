// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {AppWords} from '../components/app/app-words';
import {AppContext} from '../components/app/context';
import {InitialResourceProvider, type InitialResources} from '../components/app/initial-resources';
import {TodayJobs,OwnerSummary} from '../components/app/owner-today';
import {useResource} from '../components/app/resource';
it('keeps Hindi dashboard jobs and counts when a route refresh drops the server seed',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 const words=JSON.parse(readFileSync('public/i18n/hi.json','utf8'));
 const url='/api/workspaces/demo/work-orders?today=true&sort=scheduled_for&dir=asc&pageSize=10';
 const page={data:[{id:'one',title:'नल ठीक करना',status:'open',scheduled_for:null,assignee_name:'Imran',site_name:'Harbor'}],total:1};
 const resources:InitialResources={[url]:{data:page}};
 let resolve!:(value:Response)=>void;
 vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(r=>{resolve=r;})));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 function screen(seed:InitialResources){return <AppWords language="hi" words={words}><AppContext.Provider value={{workspace:{timezone:'Asia/Dubai'},me:{user:{id:'imran'}}} as any}><InitialResourceProvider resources={seed}><OwnerSummary base="/api/workspaces/demo"/><TodayJobs base="/api/workspaces/demo"/></InitialResourceProvider></AppContext.Provider></AppWords>;}
 try{
 await act(async()=>root.render(screen(resources)));
 expect(host.textContent).toContain('नल ठीक करना');
 await act(async()=>root.render(screen({})));
 expect(host.textContent).toContain('नल ठीक करना');
 expect(host.querySelector('.owner-summary-line .num')?.textContent).toBe('1');
 expect(host.textContent).not.toMatch(/0 jobs|0 काम|Loading|No jobs|Today/);
 await act(async()=>resolve(new Response(JSON.stringify(page))));
 expect(host.textContent).toContain('नल ठीक करना');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
it('clears a previous workspace resource when the URL changes',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
 function Value({url}:{url:string}){const r=useResource<string>(url);return <p>{r.data??(r.loading?'pending':'empty')}</p>;}
 const host=document.createElement('div'),root=createRoot(host);
 const render=(url:string)=><InitialResourceProvider resources={{'/old':{data:'private old workspace'}}}><Value url={url}/></InitialResourceProvider>;
 try{await act(async()=>root.render(render('/old')));expect(host.textContent).toBe('private old workspace');await act(async()=>root.render(render('/new')));expect(host.textContent).toBe('pending');}
 finally{await act(async()=>root.unmount());vi.unstubAllGlobals();}
});
it('does not hide translated Hindi jobs while other cards request missing words',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('fetch',vi.fn(()=>new Promise(()=>{})));
 const words=JSON.parse(readFileSync('public/i18n/hi.json','utf8'));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const {Translator}=await import('../components/app/translator');
 const {Translated}=await import('../components/app/app-words');
 function screen(extra=false){return <AppWords language="hi" words={words}><InitialResourceProvider resources={{'/api/me/preferences':{data:{language:'hi'}}}}><Translator/><div className="app-main"><header>शीर्षक</header><main><Translated><h2>Today's jobs</h2></Translated><p data-no-translate>नल ठीक करना</p>{extra&&<aside><p>A newly arrived card heading</p><p>A newly arrived card description</p><p>A newly arrived card action</p></aside>}</main></div></InitialResourceProvider></AppWords>;}
 try{
 await act(async()=>root.render(screen()));
 await act(async()=>root.render(screen(true)));
 expect(host.textContent).toContain('नल ठीक करना');
 // globals.css makes every app-main child except the header transparent
 // whenever the DOM translator sets this attribute.
 expect(document.documentElement.hasAttribute('data-translating')).toBe(false);
 expect(host.textContent).not.toMatch(/A newly arrived|Today's jobs/);
 }finally{await act(async()=>root.unmount());host.remove();delete document.documentElement.dataset.translating;vi.unstubAllGlobals();}
});
