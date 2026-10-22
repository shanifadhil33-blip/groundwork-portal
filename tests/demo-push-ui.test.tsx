// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PushSettings } from '../components/app/push-settings';
import { AppContext } from '../components/app/context';
const state=vi.hoisted(()=>({request:vi.fn(),toast:vi.fn()}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),useToast:()=>state.toast}));
let host: HTMLDivElement,root:Root;
const permission=vi.fn(async()=> 'granted'),subscribe=vi.fn(),register=vi.fn(),getRegistration=vi.fn();
beforeEach(()=>{
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
  vi.clearAllMocks();localStorage.clear();
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  vi.stubGlobal('Notification',{requestPermission:permission,permission:'default'});
  vi.stubGlobal('PushManager',function(){});
  vi.stubGlobal('matchMedia',()=>({matches:false}));
  Object.defineProperty(navigator,'serviceWorker',{configurable:true,value:{register,getRegistration}});
  state.request.mockResolvedValue({sent:0,simulated:true});
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(id='ravi',demo=true){
  await act(async()=>root.render(<AppContext.Provider value={{member:null,workspace:null,reload:()=>{},updateName:()=>{},me:{user:{id,name:id,email:null,image:null,is_demo:demo},memberships:[]}}}><PushSettings/></AppContext.Provider>));
}
const click=async(el:Element|null)=>act(async()=>{(el as HTMLElement).click();});
it('demo toggles and tests stay inside the app on a browser without push support',async()=>{
  delete (window as any).PushManager;
  await mount();
  expect(host.textContent).toContain('Demo notifications');
  await click(host.querySelector('[role=switch]'));
  await click(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Send a test')!);
  expect(host.querySelector('[role=status]')?.textContent).toBe('Demo test shown here. Nothing was sent.');
  expect(state.request).toHaveBeenCalledWith('/api/me/push/test',{method:'POST'});
  expect(permission).not.toHaveBeenCalled();expect(subscribe).not.toHaveBeenCalled();
  expect(register).not.toHaveBeenCalled();expect(getRegistration).not.toHaveBeenCalled();
  await click(host.querySelector('[role=switch]'));
  expect(host.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('false');
  expect(host.querySelector('[role=status]')).toBeNull();
});
it('demo settings and receipts stay with the current persona',async()=>{
  await mount();await click(host.querySelector('[role=switch]'));
  await click(Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Send a test')!);
  await mount('sam');
  expect(host.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('false');
  expect(host.querySelector('[role=status]')).toBeNull();
  await mount('ravi');
  expect(host.querySelector('[role=switch]')?.getAttribute('aria-checked')).toBe('true');
});
it('real users still check browser subscriptions and request permission when turning on',async()=>{
  state.request.mockResolvedValue({key:'key'});getRegistration.mockResolvedValue(null);
  permission.mockResolvedValueOnce('denied');
  await mount('real',false);
  expect(state.request).toHaveBeenCalledWith('/api/me/push');
  expect(getRegistration).toHaveBeenCalledWith('/');
  await click(host.querySelector('[role=switch]'));
  expect(permission).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain('Notifications are blocked for this site.');
  expect(host.textContent).not.toContain('Demo');
});
