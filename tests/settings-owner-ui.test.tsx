// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { VisitChargeSettings } from '../components/app/visit-charge-settings';
import { AgentSettings, OwnerSettings } from '../components/app/settings';
import { AppContext, type Membership } from '../components/app/context';
const state=vi.hoisted(()=>({data:{approval_mode:'important',role_names:{},owner_handover:[] as string[],name:'Ridgeline'},request:vi.fn(),reload:vi.fn(),toast:vi.fn()}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:state.data,reload:state.reload,loading:false,error:null})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),useToast:()=>state.toast}));
vi.mock('../components/app/translator',()=>({changeAppLanguage:vi.fn()}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);state.data.owner_handover=[];vi.clearAllMocks();state.request.mockResolvedValue({});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(owner:boolean,handover:string[]=[]){
 const member:Membership={workspace_id:'company',workspace_name:'Ridgeline',role:'admin',is_owner:owner,client_id:null,client_name:null};
 state.data.owner_handover=handover;
 await act(async()=>root.render(<AppContext.Provider value={{member,workspace:{id:'company',name:'Ridgeline',is_demo:false,timezone:'Asia/Dubai',country:'AE',region:null,currency:'AED',owner_handover:handover},me:{user:{id:'imran',name:'Imran',email:null,image:null},memberships:[member]},reload:state.reload,updateName:()=>{}}}><AgentSettings base="/api/workspaces/company" admin/><OwnerSettings base="/api/workspaces/company"/></AppContext.Provider>));
}
it('shows owner switches and close account, saves handover with Saved feedback',async()=>{
 await mount(true);
 expect(host.querySelectorAll('[role="switch"]')).toHaveLength(2);
 expect(host.textContent).toContain('Admins can change when the agent asks first');
 expect(host.textContent).toContain('Admins can mark jobs as paid');
 expect(host.textContent).toContain('Close company account');
 expect(host.querySelectorAll('[name="approval-mode"]')).toHaveLength(2);
 const switches=host.querySelectorAll<HTMLInputElement>('[role="switch"]');
 await act(async()=>switches[0].click());
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/settings',{method:'PATCH',body:JSON.stringify({owner_handover:['approval_mode']})});
 expect(state.toast).toHaveBeenCalledWith('Saved');
 expect((switches[0].closest('label') as HTMLElement).style.minHeight).toBe('44px');
});
it('plain admins see the mode and owner line, with no switches or close button',async()=>{
 await mount(false);
 expect(host.textContent).toContain('Ask before important actions');
 expect(host.textContent).toContain('Only the owner can change this.');
 expect(host.querySelector('[name="approval-mode"]')).toBeNull();
 expect(host.querySelector('[role="switch"]')).toBeNull();
 expect(host.textContent).not.toContain('Close company account');
 // Admins may still rename roles without sending an owner power in the patch.
 const input=host.querySelector('input[id="role-name-admin"]') as HTMLInputElement;
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Lead');input.dispatchEvent(new Event('input',{bubbles:true}));});
 const form=host.querySelector('form')!;
 await act(async()=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 const body=JSON.parse(state.request.mock.calls[0][1].body);
 expect(body.role_names.admin).toBe('Lead');expect(body).not.toHaveProperty('approval_mode');
});
it('shows approval controls to admins after handover, but keeps owner switches and closing hidden',async()=>{
 await mount(false,['approval_mode']);
 expect(host.querySelectorAll('[name="approval-mode"]')).toHaveLength(2);
 expect(host.textContent).not.toContain('Only the owner can change this.');
 expect(host.querySelector('[role="switch"]')).toBeNull();
 expect(host.textContent).not.toContain('Close company account');
});

async function mountPrice(role:Membership['role'],owner=false){
 Object.assign(state.data,{visit_charge:'150.00',visit_charge_regions:{Sharjah:200},visit_charge_sample:true,currency:'AED',country:'AE'});
 const member:Membership={workspace_id:'company',workspace_name:'Ridgeline',role,is_owner:owner,client_id:null,client_name:null};
 await act(async()=>root.render(<AppContext.Provider value={{member,workspace:null,me:{user:{id:'imran',name:'Imran',email:null,image:null},memberships:[member]},reload:state.reload,updateName:()=>{}}}><VisitChargeSettings base="/api/workspaces/company"/></AppContext.Provider>));
}
it.each([true,false])('owner and admin can save visit charge with Saved feedback: %s',async owner=>{
 await mountPrice('admin',owner);
 expect(host.textContent).toContain('Households see this before they send a request.');
 const amounts=host.querySelectorAll<HTMLInputElement>('input[type="number"]');
 expect(amounts[0].value).toBe('150.00');expect(amounts[1].value).toBe('200');
 expect(amounts[0].style.minHeight).toBe('44px');
 // The region picker is the app dropdown (known issues: custom dropdowns for known options), not a native select.
 expect(host.querySelector('select')).toBeNull();expect(host.querySelector('#visit-region-0')!.textContent).toContain('Sharjah');
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(amounts[0],'175');amounts[0].dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
 expect(JSON.parse(state.request.mock.calls[0][1].body)).toEqual({visit_charge:175,visit_charge_regions:{Sharjah:200},visit_charge_sample:true});
 expect(state.toast).toHaveBeenCalledWith('Saved');
});
it.each(['staff','technician','client'] as const)('visit charge controls hidden from %s',async role=>{
 await mountPrice(role);expect(host.querySelector('form')).toBeNull();
});
