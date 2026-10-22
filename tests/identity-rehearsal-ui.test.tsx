// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { JoinPreview } from '../components/public/join-preview';
import { AddFieldWorker } from '../components/app/field-workers';
import { SettingsInvites } from '../components/app/settings-invites';
import { AppContext } from '../components/app/context';
import { PRACTICE_CODE, PRACTICE_NOTICE, PRACTICE_EMAIL_HINT } from '../lib/identity-rehearsal';
const api=vi.hoisted(()=>({post:vi.fn(),request:vi.fn()}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:api.post,request:api.request}));
vi.mock('../components/ui/lazy-dialog',()=>import('../components/ui/dialog'));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  vi.stubGlobal('fetch',vi.fn());
  vi.clearAllMocks();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  api.request.mockResolvedValue([]);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(node:React.ReactNode,demo=true){
  await act(async()=>root.render(<AppContext.Provider value={{me:{user:{id:'imran',name:'Imran',email:null,image:null},memberships:[]},member:{workspace_id:'sample',workspace_name:'Sample',role:'admin',client_id:null,client_name:null},workspace:{id:'sample',name:'Sample',is_demo:demo,timezone:'Asia/Dubai',country:'AE',region:'Dubai',currency:'AED'},reload(){},updateName(){}}}>{node}</AppContext.Provider>));
}
async function input(el:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
async function click(text:string){const b=Array.from(document.querySelectorAll('button')).find(el=>el.textContent===text);expect(b).toBeTruthy();await act(async()=>b!.click());}
async function submit(form:HTMLFormElement){await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));}
it('join preview shows wrong and sample code results without network requests or session changes',async()=>{
  const cookie=document.cookie;
  await mount(<JoinPreview/>);
  await input(host.querySelector('input')!,'wrong');await submit(host.querySelector('form')!);
  expect(host.querySelector('[role=alert]')?.textContent).toContain('That did not work.');
  await input(host.querySelector('input')!,PRACTICE_CODE);await submit(host.querySelector('form')!);
  expect(host.querySelector('[role=status]')?.textContent).toContain('Practice sign in complete.');
  expect(document.cookie).toBe(cookie);
  expect(api.post).not.toHaveBeenCalled();expect(api.request).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
});
it.each([true,false])('worker result uses safe local preview only for demo: %s',async demo=>{
  api.post.mockResolvedValue({name:'Yusuf',token:demo?'practice':'real-test-token',code:demo?PRACTICE_CODE:'123456',simulated:demo});
  await mount(<AddFieldWorker base="/api/workspaces/sample" admin demo={demo} onDone={()=>{}}/>,demo);
  await click('Add field worker');
  expect(document.querySelector('#fw-name')).toBeInstanceOf(HTMLInputElement);
  await input(document.querySelector('#fw-name')!,'Yusuf');
  await click('Add');
  const links=Array.from(document.querySelectorAll<HTMLAnchorElement>('a'));
  expect(links.some(a=>a.href.includes('wa.me'))).toBe(!demo);
  if(demo){
    expect(document.body.textContent).toContain(PRACTICE_NOTICE);
    expect(document.body.textContent).toContain('Sharing preview');
    expect(links.some(a=>a.getAttribute('href')==='/join?preview=worker')).toBe(true);
  }else expect(document.body.textContent).toContain('Send on WhatsApp');
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/workspaces/sample/field-workers',{name:'Yusuf',phone:'',role:'technician'});
  expect(fetch).not.toHaveBeenCalled();
});
it('fictional invite validation and confirmation stay in the practice form with no sharing destination',async()=>{
  await mount(<SettingsInvites base="/api/workspaces/sample" demo/>);
  await input(host.querySelector('input[type=email]')!,'person@example.com');
  await submit(host.querySelector('form')!);
  expect(host.querySelector('[role=alert]')?.textContent).toBe(PRACTICE_EMAIL_HINT);
  expect(api.post).not.toHaveBeenCalled();
  await input(host.querySelector('input[type=email]')!,'yusuf@harbor.example');
  await submit(host.querySelector('form')!);
  expect(document.querySelector('[role=dialog]')?.textContent).toContain(PRACTICE_NOTICE);
  expect(api.post).not.toHaveBeenCalled();
  const confirm=Array.from(document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')).find(b=>b.textContent==='Create invite')!;
  await act(async()=>confirm.click());
  expect(api.post).toHaveBeenCalledExactlyOnceWith('/api/workspaces/sample/invites',{email:'yusuf@harbor.example',role:'staff'});
  expect(host.querySelector('[role=status]')?.textContent).toContain('Practice invite created.');
  expect(document.querySelector('a[href*="wa.me"]')).toBeNull();
});
it('every new identity phrase is supplied in every language file',()=>{
  for(const file of readdirSync('public/i18n')){
    const words=JSON.parse(readFileSync(`public/i18n/${file}`,'utf8'));
    for(const phrase of [PRACTICE_NOTICE,PRACTICE_EMAIL_HINT,'Sharing preview','Sign in preview','Practice invite created. It cannot grant access.','Practice sign in complete. You are still using the same account.','Revoked','Pending']) expect(words[phrase],`${file}: ${phrase}`).toBeTruthy();
  }
});
