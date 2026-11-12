// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FindCompany, ListingSettings, HomeAddress, JoinRequests } from '../components/app/company-joining';
const state=vi.hoisted(()=>({demo:false,workspaceDemo:null as boolean|null,urls:[] as (string|null)[],resources:new Map<string,unknown>(),request:vi.fn(),reload:vi.fn()}));
vi.mock('../components/app/context',()=>({useApp:()=>({me:{user:{id:'resident',name:'Resident',phone:'+971501234567',is_demo:state.demo}},workspace:{id:'sample',is_demo:state.workspaceDemo??state.demo},reload:state.reload})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>{state.urls.push(url);return {data:state.resources.get(url??'')??[],loading:false,error:null,reload:state.reload};}}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/ui',()=>({Button:({children,busy,variant,...props}:any)=><button {...props}>{children}</button>,Badge:({children}:any)=><span>{children}</span>,Skeleton:()=>null,ErrorState:()=>null,EmptyState:({title,children}:any)=><div>{title}{children}</div>}));
(globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,el:HTMLDivElement;
const company={id:'company',name:'Palm Maintenance',listing_area:'Palm',trades:['ac']};
beforeEach(()=>{vi.useFakeTimers();state.demo=false;state.workspaceDemo=null;state.urls=[];state.resources.clear();state.request.mockReset().mockResolvedValue({});state.reload.mockReset();el=document.createElement('div');document.body.append(el);root=createRoot(el);});
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
it('demo search and fictional form use only the private endpoint, retain cancelled input and show a pending receipt',async()=>{
 state.demo=true;
 const endpoint='/api/demo/company-joining';
 state.resources.set(`${endpoint}?details=1`,{name:'Yusuf',phone:'+971000000000',address:'Flat 14, Sample Court',note:''});
 state.resources.set(`${endpoint}?q=Ri`,[{...company,id:'sample',name:'Ridgeline Facility Services'}]);
 mount(<FindCompany/>);expect(el.textContent).toContain('Practice join');
 await input(el.querySelector('input')!,'R');await act(async()=>{vi.advanceTimersByTime(400);});expect(state.urls.some(u=>u?.includes('?q='))).toBe(false);
 await input(el.querySelector('input')!,'Ri');await act(async()=>{vi.advanceTimersByTime(350);});await tap('Ask to join');
 expect((el.querySelector('input[type=tel]') as HTMLInputElement).readOnly).toBe(true);
 expect((el.querySelector('input[autocomplete=name]') as HTMLInputElement).value).toBe('Yusuf');
 await input(el.querySelector('input[autocomplete=name]')!,'Hassan');await tap('Cancel');expect(el.querySelector('form')).toBeNull();await tap('Ask to join');
 expect((el.querySelector('input[autocomplete=name]') as HTMLInputElement).value).toBe('Hassan');
 state.resources.set(endpoint,[{id:'request',workspace_id:'sample',company_name:'Ridgeline Facility Services',status:'pending'}]);
 await act(async()=>{el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});
 expect(state.request).toHaveBeenCalledWith(endpoint,{method:'POST',body:JSON.stringify({workspace_id:'sample',kind:'household',name:'Hassan',phone:'+971000000000',address:'Flat 14, Sample Court',note:''})});
 expect(el.textContent).toContain('Waiting for a reply');
 expect(state.request.mock.calls.every(([url])=>url.startsWith('/api/demo/'))).toBe(true);
 expect(state.urls.every(u=>u===null||u.startsWith('/api/demo/'))).toBe(true);
});
it.each(['accepted','declined'])('demo %s reply keeps access unchanged and cannot switch company or claim a real membership',status=>{
 state.demo=true;const endpoint='/api/demo/company-joining';
 state.resources.set(`${endpoint}?details=1`,{name:'Yusuf',phone:'+971000000000',address:'Sample Court',note:''});
 state.resources.set(endpoint,[{id:'request',workspace_id:'sample',company_name:'Ridgeline Facility Services',status}]);
 mount(<FindCompany/>);expect(el.textContent).toContain('This is a sample reply. Your access has not changed.');
 expect(el.textContent).not.toContain('You have joined this company.');expect(el.textContent).not.toContain('Open my home');expect(state.request).not.toHaveBeenCalled();
});
it.each(['Accept','Decline'])('office demo %s answers a scratch receipt through the private endpoint',async label=>{
 state.demo=true;
 state.resources.set('/api/demo/company-joining?workspace=sample',[{id:'receipt',name:'Yusuf',kind:'household',phone:'+971000000000',address:'Sample Court',note:'',status:'pending'}]);
 mount(<JoinRequests base="/api/workspaces/sample" onChanged={state.reload}/>);expect(el.textContent).toContain('This is a demo.');await tap(label);
 expect(state.request).toHaveBeenCalledWith('/api/demo/company-joining',{method:'PATCH',body:JSON.stringify({workspace_id:'sample',id:'receipt',status:label==='Accept'?'accepted':'declined'})});
});
it('real office decisions keep using the real workspace route',async()=>{
 state.resources.set('/api/workspaces/sample/join-requests',[{id:'receipt',name:'Yusuf',kind:'household',status:'pending'}]);
 mount(<JoinRequests base="/api/workspaces/sample" onChanged={state.reload}/>);await tap('Accept');
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/sample/join-requests/receipt',{method:'PATCH',body:JSON.stringify({status:'accepted'})});expect(el.textContent).not.toContain('This is a demo.');
});

it('a demo identity keeps office decisions private while workspace details refresh',async()=>{
 state.demo=true;state.workspaceDemo=false;
 state.resources.set('/api/demo/company-joining?workspace=sample',[{id:'receipt',name:'Yusuf',kind:'household',status:'pending'}]);
 mount(<JoinRequests base="/api/workspaces/sample" onChanged={state.reload}/>);await tap('Accept');
 expect(state.request).toHaveBeenCalledWith('/api/demo/company-joining',{method:'PATCH',body:JSON.stringify({workspace_id:'sample',id:'receipt',status:'accepted'})});
 expect(state.urls.every(url=>url===null||url.startsWith('/api/demo/'))).toBe(true);
});
