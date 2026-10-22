// @vitest-environment jsdom
import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChecklistSettings, JobChecklistCard } from '../components/app/job-checklists';
const state=vi.hoisted(()=>({data:{} as any,request:vi.fn()}));
vi.mock('../components/app/resource',()=>({useResource:()=>{const [data,setData]=useState(state.data);return {data,setData,loading:false,error:null,reload:vi.fn()};}}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.clearAllMocks();});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
const button=(label:string)=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===label)!;
async function input(element:HTMLInputElement,value:string){await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
const progress=()=>({steps:[{name:'Clean the filter',done:false},{name:'Check cooling',done:false}],materials:[{id:'a',name:'Capacitor',quantity:2,note:'Outdoor unit'}],editable:true});
it('settings accepts suggestions, reorders and saves with lasting feedback',async()=>{
 state.data={ac:['First','Second']};state.request.mockResolvedValue({});
 await act(async()=>root.render(<ChecklistSettings base="/company"/>));
 await act(async()=>button('Move down').click());
 expect(Array.from(host.querySelectorAll('input')).map(i=>i.value)).toEqual(['Second','First']);
 await act(async()=>button('Use suggested steps').click());
 expect(host.querySelectorAll('input')).toHaveLength(5);
 await act(async()=>button('Save checklist').click());
 expect(state.request).toHaveBeenCalledWith('/company/checklists',expect.objectContaining({method:'PUT',body:JSON.stringify({trade:'ac',steps:['Clean the filter','Check the drain','Check cooling','Check for leaks','Clean the work area']})}));
 expect(host.querySelector('[role="status"]')?.textContent).toBe('Saved');
});
it('tick saves straight away and the client view shows counts, materials and notes without edit controls',async()=>{
 state.data=progress();state.request.mockResolvedValue({...state.data,steps:[{name:'Clean the filter',done:true},{name:'Check cooling',done:false}]});
 await act(async()=>root.render(<JobChecklistCard base="/company" id="job"/>));
 await act(async()=>host.querySelector<HTMLInputElement>('[type="checkbox"]')!.click());
 expect(JSON.parse(state.request.mock.calls[0][1].body)).toEqual({action:'tick',step:'Clean the filter',done:true});
 expect(host.textContent).toContain('1 of 2 steps done');
 await act(async()=>root.render(<JobChecklistCard base="/company" id="job" readOnly/>));
 expect(Array.from(host.querySelectorAll<HTMLInputElement>('[type="checkbox"]')).every(c=>c.disabled)).toBe(true);
 expect(host.querySelector('form')).toBeNull();expect(button('Remove')).toBeUndefined();
 expect(host.textContent).toContain('2 × Capacitor');expect(host.textContent).toContain('Outdoor unit');
});
it('failed material save keeps typed fields and retries with the same request key',async()=>{
 state.data=progress();state.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({...state.data,materials:[...state.data.materials,{id:'b',name:'Washer',quantity:3}]});
 await act(async()=>root.render(<JobChecklistCard base="/company" id="job"/>));
 const inputs=host.querySelectorAll<HTMLInputElement>('form input');
 await input(inputs[0],'Washer');await input(inputs[1],'3');
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(inputs[0].value).toBe('Washer');expect(inputs[1].value).toBe('3');expect(host.querySelector('[role="alert"]')).not.toBeNull();
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(state.request.mock.calls[1][1].headers).toEqual(state.request.mock.calls[0][1].headers);
 expect(host.querySelector<HTMLInputElement>('form input')!.value).toBe('');
 expect(host.textContent).toContain('3 × Washer');
});
