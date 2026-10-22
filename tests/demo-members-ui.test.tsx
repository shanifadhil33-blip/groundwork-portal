// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Team } from '../components/app/clients';
import { AppContext, type Membership } from '../components/app/context';
const state=vi.hoisted(()=>({members:[{user_id:'sam',name:'Sam',email:null,role:'staff',client_id:null,extra_roles:[],archived_at:null as string|null},{user_id:'kevin',name:'Kevin',email:null,role:'client',client_id:'harbor',extra_roles:[],archived_at:null as string|null}],request:vi.fn(),reload:vi.fn(),toast:vi.fn()}));
vi.mock('../components/ui/lazy-dialog',()=>import('../components/ui/dialog'));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:state.members,reload:state.reload,loading:false,error:null})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),useToast:()=>state.toast}));
vi.mock('../components/app/contact-name',()=>({ContactName:({name}:{name:string})=><>{name}</>}));
vi.mock('../components/app/field-workers',()=>({NewLinkButton:()=> <button>Issue real link</button>}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);state.members.forEach(m=>m.archived_at=null);vi.clearAllMocks();state.request.mockResolvedValue({jobs:3,notes:1,open_jobs:1,can_delete:false});});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();});
async function mount(demo:boolean,role:Membership['role']='admin'){
 const member:Membership={workspace_id:'company',workspace_name:'Ridgeline',role,is_owner:true,client_id:null,client_name:null};
 await act(async()=>root.render(<AppContext.Provider value={{member,workspace:{id:'company',name:'Ridgeline',is_demo:demo,timezone:'Asia/Dubai',country:'AE',region:null,currency:'AED'},me:{user:{id:'imran',name:'Imran',email:null,image:null},memberships:[member]},reload:state.reload,updateName:()=>{}}}><Team base="/api/workspaces/company"/></AppContext.Provider>));
}
async function click(text:string){const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent===text);expect(button, text).toBeTruthy();await act(async()=>button!.click());}
it('opens the correct demo team record and saves through the existing roles endpoint',async()=>{
 await mount(true);
 expect(host.textContent).toContain('In practice, team members and clients stay separate.');
 expect(host.textContent).not.toContain('Remove member');expect(host.textContent).not.toContain('Issue real link');
 const roles=Array.from(host.querySelectorAll<HTMLButtonElement>('tbody tr:first-child button')).find(b=>b.textContent==='Roles')!;await act(async()=>roles.click());
 expect(document.body.textContent).toContain('What Sam does');
 await click('Save');
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/members/sam/roles',{method:'PUT',body:JSON.stringify({roles:['staff']})});
 expect(state.reload).toHaveBeenCalled();
});
it('offers demo client archive without a failing Delete and can restore an archived client',async()=>{
 await mount(true);
 const more=host.querySelector<HTMLButtonElement>('[aria-label="More for Kevin"]');expect(more).toBeTruthy();
 await act(async()=>more!.click());
 expect(document.body.textContent).not.toContain('Delete');
 await click('Archive');
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/members/kevin/impact');
 await click('Archive');
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/members/kevin/archive',{method:'POST'});
 state.members[1].archived_at='2026-10-22';await mount(true);
 await click('Unarchive');
 expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/members/kevin/archive',{method:'DELETE'});
});
it('retains the legacy role and removal controls for real members',async()=>{
 await mount(false);
 expect(host.textContent).toContain('Remove member');expect(host.textContent).toContain('Issue real link');
 expect(host.querySelector('#member-role-sam')).toBeTruthy();
 expect(host.textContent).not.toContain('In practice, team members and clients stay separate.');
});
it('does not expose demo member controls to office staff',async()=>{
 await mount(true,'staff');
 expect(host.textContent).not.toContain('Roles');expect(host.querySelector('[aria-label="More for Sam"]')).toBeNull();
});
