// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Equipment } from '../components/app/equipment';
import { request } from '../lib/ui/api';
const state=vi.hoisted(()=>({units:[] as any[],history:[] as any[],reload:vi.fn()}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,data:url?.includes('?site_id=')?state.units:url?{...state.units[0],history:state.history}:undefined,reload:state.reload})}));
vi.mock('../lib/ui/api',()=>({request:vi.fn()}));
vi.mock('../components/ui',()=>({
 Button:({children,onClick,disabled}:any)=><button type="button" disabled={disabled} onClick={onClick}>{children}</button>,
 Dialog:({open,title,children,footer}:any)=>open?<div role="dialog"><h2>{title}</h2>{children}{footer}</div>:null,
 ConfirmDialog:({open,title,children,onConfirm}:any)=>open?<div role="dialog"><h2>{title}</h2>{children}<button onClick={onConfirm}>Archive</button></div>:null,
 Dropdown:({id,label,value,options,onChange}:any)=><select id={id} aria-label={label} value={value} onChange={e=>onChange(e.target.value)}>{options.map((o:any)=><option key={o.value} value={o.value}>{o.label}</option>)}</select>,
 DatePicker:({id,label,value,onChange}:any)=><input id={id} aria-label={label} type="date" value={value??''} onChange={e=>onChange(e.target.value)}/>,
 LocalTime:({value}:any)=><span>{value}</span>,ErrorState:()=>null,
}));
(globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>;
afterEach(()=>{act(()=>root?.unmount());document.body.innerHTML='';state.units=[];state.history=[];vi.clearAllMocks();});
function mount(canManage=true){const el=document.createElement('div');document.body.append(el);root=createRoot(el);act(()=>root.render(<Equipment base="/api/workspaces/demo" siteId="site" canManage={canManage}/>));return el;}
async function tap(el:HTMLElement,label:string){await act(async()=>{Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!.click();});}
function render(){act(()=>root.render(<Equipment base="/api/workspaces/demo" siteId="site" canManage/>));}
async function enter(el:HTMLElement,id:string,value:string){await act(async()=>{const input=el.querySelector<HTMLInputElement>(`#${id}`)!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});}
it('shows the empty state and all add dialog fields and types',async()=>{
 const el=mount();expect(el.textContent).toContain('No equipment yet.');await tap(el,'Add equipment');
 for(const text of ['Name','Type','Location','Make','Model','Serial','Installed','Notes'])expect(el.textContent).toContain(text);
 expect(Array.from(el.querySelectorAll('option')).map(o=>o.textContent)).toEqual(['AC unit','Water heater','Electrical panel','Pump','Lift','Generator','Other']);expect(el.querySelector('input[type=date]')).toBeTruthy();
});
it('saves without blocking the page and shows the added equipment',async()=>{
 const el=mount();await tap(el,'Add equipment');await enter(el,'equipment-name-site','Roof AC 2');await enter(el,'equipment-location-site','Roof');
 vi.mocked(request).mockImplementationOnce(async()=>{state.units=[{id:'unit',site_id:'site',name:'Roof AC 2',kind:'ac',location:'Roof'}];return state.units[0];});
 await tap(el,'Save equipment');render();expect(request).toHaveBeenCalledWith('/api/workspaces/demo/assets',expect.objectContaining({method:'POST',body:expect.stringContaining('Roof AC 2')}));expect(state.reload).toHaveBeenCalled();expect(el.querySelector('[role=dialog]')).toBeNull();expect(el.textContent).toContain('Roof AC 2');expect(el.textContent).toContain('AC unit');expect(el.textContent).toContain('Roof');
 await tap(el,'Roof AC 2AC unitRoof');expect(el.textContent).toContain('No jobs on this unit yet.');
});
it('manager view is read only and history links to jobs',async()=>{
 state.units=[{id:'unit',site_id:'site',name:'Roof AC 1',kind:'ac',location:null}];state.history=[{id:'job',order_number:12,title:'Repair cooling',status:'done',finished_at:'2026-01-02',outcome:'fixed',technician_name:'Ravi'}];
 const el=mount(false);expect(el.textContent).not.toContain('Add equipment');await tap(el,'Roof AC 1AC unit');expect(el.textContent).toContain('Repair cooling');expect(el.textContent).toContain('Fixed');expect(el.querySelector('a')?.getAttribute('href')).toBe('/work-orders/job');expect(Array.from(el.querySelectorAll('button')).map(b=>b.textContent)).not.toContain('Edit');expect(el.textContent).not.toContain('Archive');
});
it('keeps the dialog open with a plain error after a failed save',async()=>{const el=mount();await tap(el,'Add equipment');await enter(el,'equipment-name-site','Roof AC');vi.mocked(request).mockRejectedValueOnce(new Error('Try again.'));await tap(el,'Save equipment');expect(el.querySelector('[role=alert]')?.textContent).toBe('Try again.');expect(el.querySelector('[role=dialog]')).toBeTruthy();});
