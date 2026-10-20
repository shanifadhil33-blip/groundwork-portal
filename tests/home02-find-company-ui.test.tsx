// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FindCompany, ListingSettings, HomeAddress } from '../components/app/company-joining';
const state=vi.hoisted(()=>({urls:[] as (string|null)[],resources:new Map<string,unknown>(),request:vi.fn(),reload:vi.fn()}));
vi.mock('../components/app/context',()=>({useApp:()=>({me:{user:{name:'Resident',phone:'+971501234567'}},reload:state.reload})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>{state.urls.push(url);return {data:state.resources.get(url??'')??[],loading:false,error:null,reload:state.reload};}}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/ui',()=>({Button:({children,busy,variant,...props}:any)=><button {...props}>{children}</button>,Badge:({children}:any)=><span>{children}</span>,Skeleton:()=>null,ErrorState:()=>null,EmptyState:({title,children}:any)=><div>{title}{children}</div>}));
(globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,el:HTMLDivElement;
const company={id:'company',name:'Palm Maintenance',listing_area:'Palm',trades:['ac']};
beforeEach(()=>{vi.useFakeTimers();state.urls=[];state.resources.clear();state.request.mockReset().mockResolvedValue({});state.reload.mockReset();el=document.createElement('div');document.body.append(el);root=createRoot(el);});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';vi.useRealTimers();});
function mount(view:React.ReactNode){act(()=>root.render(view));}
async function input(node:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('input',{bubbles:true}));});}
async function tap(label:string){await act(async()=>{Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!.click();});}
it('waits for a pause and two characters before searching',async()=>{
 mount(<FindCompany/>);const field=el.querySelector('input')!;
 await input(field,'P');await act(async()=>{vi.advanceTimersByTime(400);});expect(state.urls.some(u=>u?.startsWith('/api/find-company'))).toBe(false);
 await input(field,'Pa');await act(async()=>{vi.advanceTimersByTime(349);});expect(state.urls.some(u=>u?.startsWith('/api/find-company'))).toBe(false);
 await act(async()=>{vi.advanceTimersByTime(1);});expect(state.urls).toContain('/api/find-company?q=Pa');
});
it('prefills the profile, requires a household address, and sends his chosen kind',async()=>{
 state.resources.set('/api/find-company?q=Pa',[company]);mount(<FindCompany/>);await input(el.querySelector('input')!,'Pa');await act(async()=>{vi.advanceTimersByTime(350);});await tap('Ask to join');
 expect(Array.from(el.querySelectorAll('input')).some(n=>n.value==='+971501234567')).toBe(true);
 expect(el.querySelector('textarea')!.required).toBe(true);await tap('I am a business');expect(el.querySelector('textarea')!.required).toBe(false);
 await act(async()=>{el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 const call=state.request.mock.calls.find(([url])=>url==='/api/join-requests')!;
 expect(JSON.parse(call[1].body)).toMatchObject({workspace_id:'company',kind:'manager',name:'Resident',phone:'+971501234567'});
 expect(el.textContent).toContain('Request sent to Palm Maintenance. They will reply here.');
});
it('saves company consent and its area through the workspace service route',async()=>{
 state.resources.set('/api/workspaces/company/settings',{listed:false,listing_area:'Palm'});mount(<ListingSettings base="/api/workspaces/company"/>);
 const toggle=el.querySelector('[role=switch]') as HTMLInputElement;expect(toggle.checked).toBe(false);await act(async()=>toggle.click());
 await act(async()=>{el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company',{method:'PATCH',body:JSON.stringify({listed:true,listing_area:'Palm'})});
});
it('uses the narrow home address route',async()=>{
 state.resources.set('/api/workspaces/company/request-sites',[{id:'site',name:'My home',address:'Palm Road'}]);mount(<HomeAddress base="/api/workspaces/company"/>);
 await act(async()=>{el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/sites/site/home-address',{method:'PATCH',body:JSON.stringify({address:'Palm Road'})});
});
