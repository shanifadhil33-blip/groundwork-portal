// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DataProtection } from '../components/app/data-protection';
import { PrivacyNotice } from '../components/public/privacy-notice';
import { AppContext, type Membership } from '../components/app/context';
const state=vi.hoisted(()=>({requests:[] as {user_id:string;name:string;status:string}[],request:vi.fn(),reload:vi.fn()}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{requests:state.requests,practice:true},reload:state.reload,loading:false,error:null})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);state.requests=[];vi.clearAllMocks();state.request.mockResolvedValue({practice:true,completed:true});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
async function mount(role:Membership['role']='technician',owner=false,memberExists=true){
 const member:Membership={workspace_id:'company',workspace_name:'Company',role,is_owner:owner,client_id:null,client_name:null};
 await act(async()=>root.render(<AppContext.Provider value={{member:memberExists?member:null,workspace:memberExists?{id:'company',name:'Company',is_demo:true,timezone:'Asia/Dubai',country:'AE',region:null,currency:'AED'}:null,me:{user:{id:'person',name:'Person',email:null,image:null},memberships:memberExists?[member]:[]},reload:state.reload,updateName:()=>{}}}><DataProtection/></AppContext.Provider>));
}
it('does not send deletion until Yes and Change cancels without a write',async()=>{
 await mount();
 expect(host.querySelector('a[href="/privacy"]')).not.toBeNull();
 await act(async()=>button('Ask to delete my account').click());
 expect(host.textContent).toContain('Send your deletion request?');expect(state.request).not.toHaveBeenCalled();
 await act(async()=>button('Change').click());expect(button('Yes')).toBeUndefined();expect(state.request).not.toHaveBeenCalled();
 await act(async()=>button('Ask to delete my account').click());await act(async()=>button('Yes').click());
 expect(state.request).toHaveBeenCalledWith('/api/me/deletion-request',{method:'POST',body:'{"confirm":true}',headers:{'groundwork-user':'person'}});
 expect(host.textContent).toContain('Your deletion request is saved.');
});
it('admin handles requests with confirmation and sees a labelled practice result',async()=>{
 state.requests=[{user_id:'requester',name:'Requester',status:'pending'}];await mount('admin');
 expect(host.textContent).toContain('Practice only.');expect(button('Export company data')).toBeDefined();
 await act(async()=>button('Handle deletion request').click());expect(state.request).not.toHaveBeenCalled();
 await act(async()=>button('Yes').click());
 expect(state.request.mock.calls[0][0]).toBe('/api/workspaces/company/deletion-requests/requester');
 expect(host.textContent).toContain('Your sandbox still works.');
});
it('owner can practise company closure, other admins cannot and personal deletion requires ownership handover',async()=>{
 await mount('admin');expect(button('Close company workspace')).toBeUndefined();
 await mount('admin',true);expect(button('Ask to delete my account')).toBeUndefined();
 await act(async()=>button('Close company workspace').click());expect(host.textContent).toContain('Company work records will be removed.');expect(state.request).not.toHaveBeenCalled();
 await act(async()=>button('Yes').click());expect(state.request.mock.calls[0][0]).toBe('/api/workspaces/company/privacy-close');
 expect(host.textContent).toContain('The workspace would close.');
});
it.each(['staff','technician','client'] as const)('%s has personal controls without company export or request handling',async role=>{
 await mount(role);expect(button('Export my data')).toBeDefined();expect(button('Ask to delete my account')).toBeDefined();
 expect(button('Export company data')).toBeUndefined();expect(host.textContent).not.toContain('Deletion requests');
});
it('warns that an account without a company is deleted immediately after Yes',async()=>{
 await mount('technician',false,false);expect(host.textContent).toContain('Without a company, Yes deletes your account now.');
 await act(async()=>button('Ask to delete my account').click());expect(host.querySelector('[aria-label="Confirm data request"]')?.textContent).toContain('Without a company, Yes deletes your account now.');
 expect(state.request).not.toHaveBeenCalled();
});
it.each([360,390])('ships English and Gulf Arabic with RTL at a %s phone viewport without fetching copy',async width=>{
 Object.defineProperty(window,'innerWidth',{value:width,configurable:true});const fetch=vi.fn();vi.stubGlobal('fetch',fetch);
 await act(async()=>root.render(<PrivacyNotice/>));
 expect(host.querySelector('h1')?.textContent).toBe('Privacy and your data');
 expect(host.querySelectorAll('article section')).toHaveLength(8);expect(host.textContent).not.toMatch(/[-–—]/);
 await act(async()=>button('العربية').click());
 const notice=host.querySelector('.privacy-notice')!;
 expect(notice.getAttribute('dir')).toBe('rtl');expect(notice.getAttribute('lang')).toBe('ar-AE');
 expect(host.querySelector('h1')?.textContent).toBe('الخصوصية وبياناتك');expect(host.textContent).toContain('كم مدة حفظ البيانات');
 for(const section of host.querySelectorAll('article section')) expect(section.textContent).toMatch(/\p{Script=Arabic}/u);
 expect(host.textContent).not.toMatch(/[-–—]/);expect(fetch).not.toHaveBeenCalled();
 await act(async()=>button('English').click());expect(notice.getAttribute('dir')).toBe('ltr');
});
