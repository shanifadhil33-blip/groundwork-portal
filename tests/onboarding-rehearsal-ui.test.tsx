// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { GuidedOnboarding } from '../components/app/guided-onboarding';
const state=vi.hoisted(()=>({demo:true,request:vi.fn(),reload:vi.fn(),language:vi.fn()}));
vi.mock('../components/app/context',()=>({useApp:()=>({me:{user:{id:'person',name:'Imran',is_demo:state.demo}},workspace:{id:'sample',is_demo:state.demo},reload:state.reload})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/app/translator',()=>({changeAppLanguage:state.language}));
vi.mock('../components/app/onboarding-helper',()=>({OnboardingHelper:()=> <p>Real setup helper</p>}));
vi.mock('../components/ui/layout',()=>({PageHeader:({children}:any)=><header>{children}</header>}));
vi.mock('../components/ui',()=>({Button:({children,busy,variant,...props}:any)=><button {...props}>{children}</button>,Dropdown:({label,value,options,onChange}:any)=><select aria-label={label} value={value} onChange={e=>onChange(e.target.value)}><option value=""/>{options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
(globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>,el:HTMLDivElement;
beforeEach(()=>{state.demo=true;state.request.mockReset();state.reload.mockReset();state.language.mockReset();el=document.createElement('div');document.body.append(el);root=createRoot(el);});
afterEach(()=>{act(()=>root.unmount());document.body.innerHTML='';});
async function mount(){await act(async()=>root.render(<GuidedOnboarding/>));}
async function tap(label:string){await act(async()=>{Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!.click();});}
async function next(){await act(async()=>{el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));});}
async function field(label:string,value:string){const node=Array.from(el.querySelectorAll('label')).find(l=>l.textContent===label)?.querySelector('input');expect(node,label).toBeTruthy();await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(node,value);node!.dispatchEvent(new Event('input',{bubbles:true}));});}
async function choose(label:string,value:string){const node=el.querySelector(`select[aria-label="${label}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')!.set!.call(node,value);node.dispatchEvent(new Event('change',{bubbles:true}));});}
it('rehearses shared steps, validates, retains Back values and completes without any request or identity switch',async()=>{
 await mount();expect(el.textContent).toContain('Practice setup');
 await choose('Language','ar-AE');await next();await tap('Start a new company');await next();
 await next();expect(el.querySelector('[role=alert]')?.textContent).toBe('Please check your answers.');
 await field('Your name','Yusuf');await field('Work WhatsApp number','+971000000000');await next();
 await field('Company name','Sample repairs');await next();await choose('Country','IN');await next();
 await choose('State','Kerala');await next();await choose('Currency','USD');await next();await tap('Back');
 expect((el.querySelector('select[aria-label="Currency"]') as HTMLSelectElement).value).toBe('USD');await tap('Back');
 expect((el.querySelector('select[aria-label="State"]') as HTMLSelectElement).value).toBe('Kerala');await tap('Back');
 expect((el.querySelector('select[aria-label="Country"]') as HTMLSelectElement).value).toBe('IN');await next();await next();await next();await next();
 await tap('AC');await next();await next();await next();
 expect(el.textContent).toContain('Who will work with you?');expect(el.querySelector('a[href*="wa.me"]')).toBeNull();expect(el.textContent).not.toContain('Make invite link');
 await next();expect(el.textContent).toContain('Practice complete');
 for(const value of ['Yusuf','Sample repairs','الهند','Kerala','USD','العربية الخليجية'])expect(el.textContent).toContain(value);
 await tap('Back');expect(el.textContent).toContain('Who will work with you?');
 await act(async()=>window.dispatchEvent(new Event('groundwork-onboarding')));
 expect(state.request).not.toHaveBeenCalled();expect(state.reload).not.toHaveBeenCalled();expect(state.language).toHaveBeenCalledWith('ar-AE');
});
it.each(['Join my company’s team','Customer of a maintenance company'])('%s practice finishes without inspecting or redeeming an invite',async label=>{
 await mount();await next();await tap(label);await next();await field('Your name','Yusuf');await field('Work WhatsApp number','+971000000000');await next();await next();
 expect(el.textContent).toContain('Practice complete');expect(state.request).not.toHaveBeenCalled();
});
it('real setup still loads and saves using the real onboarding endpoint',async()=>{
 state.demo=false;state.request.mockResolvedValue({step:'language',answers:{language:'en-IN'},completed_at:null});await mount();
 expect(state.request).toHaveBeenCalledWith('/api/onboarding');expect(el.textContent).not.toContain('Practice setup');expect(el.textContent).toContain('Real setup helper');
 await next();expect(state.request).toHaveBeenCalledWith('/api/onboarding',expect.objectContaining({method:'PATCH'}));
});
it('Back retains unfinished later input without blocking an earlier question',async()=>{
 await mount();await next();await tap('Start a new company');await next();
 await field('Your name','');await tap('Back');expect(el.textContent).toContain('Who are you?');await next();
 expect(el.textContent).toContain('How can your team reach you?');
 await field('Your name','Yusuf');await field('Work WhatsApp number','bad');await tap('Back');await next();
 expect((el.querySelector('input[type=tel]') as HTMLInputElement).value).toBe('bad');
 await next();expect(el.querySelector('[role=alert]')?.textContent).toBe('Please check your answers.');
 expect(state.request).not.toHaveBeenCalled();
});
