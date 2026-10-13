import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AppContext, type Membership } from '../components/app/context';
import { NoAccess } from '../components/app/no-access';
import { ClientHome } from '../components/app/client-home';
import { Dashboard } from '../components/app/dashboard';
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,reload:()=>{},data:url?.includes('/work-orders')?{total:1,data:[{id:'order',order_number:1,title:'Repair entry door',status:'open',updated_at:'2026-10-10T12:00:00Z',due_on:null}]}:url?.includes('/dashboard')?{by_status:{open:1},overdue:13,waiting_on_parts:3,pending_queue_rows:2}:url?.includes('/supplier/sync-runs')?[]: {data:[]}})}));
const member:Membership={workspace_id:'workspace',workspace_name:'Ridgeline',role:'client',client_id:'client',client_name:'Harbor & Pine'};
function render(element:React.ReactNode,role:Membership['role']='client') {return renderToStaticMarkup(<AppContext.Provider value={{member:{...member,role},workspace:{id:'workspace',name:'Ridgeline',timezone:'Asia/Dubai',is_demo:true,country:'AE',region:null,currency:'AED'},me:{user:{id:'user',name:'Pranav',email:'pranav@example.com',image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}>{element}</AppContext.Provider>);}
it('offers sign in without a dashboard loop when signed out',()=>{
 const html=renderToStaticMarkup(<NoAccess/>);
 expect(html).toContain('href="/sign-in"');expect(html).toContain('Sign in');expect(html).toContain('Go back');expect(html).not.toContain('/dashboard');
 expect(render(<NoAccess/>)).toContain('Go home');expect(render(<NoAccess/>)).toContain('It is for your maintenance team.');expect(render(<NoAccess/>,'admin')).toContain('Go home');
});
it('groups recent update badges and time below the request title',()=>{
 const html=render(<ClientHome/>);
 expect(html).toContain('page stack client-home');
 expect(html).toMatch(/request-update-meta"><span class="badge[^>]*>Request Received<\/span><span class="small muted">Updated /);
 expect(html).toContain('<h2>Open requests</h2>');expect(html).toContain('<h2>Needs action</h2>');expect(html).toContain('action-list client-requests');expect(html).toContain('Repair entry door');
});
it('shows actionable records instead of dashboard count tiles',()=>{
 const html=render(<Dashboard/>,'admin');
 expect(html).toContain('<h2>Needs action</h2>');expect(html).toContain('Repair entry door');
 expect(html).toContain('/work-orders/order');expect(html).not.toContain('class="tile');expect(html).not.toContain('stat-strip');
});
it('defines neutral canvases and prevents badge stretching in flex columns',()=>{
 const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
 expect(css).toMatch(/:root\{[^}]*--bg:#f7f8f7;--surface:#ffffff/);
 expect(css).toMatch(/\[data-theme=dark\]\{[^}]*--bg:#000000;--surface:#000000/);
 expect(css).toMatch(/\.badge\{[^}]*width:max-content;[^}]*align-self:flex-start/);
 expect(css).toContain('.client-home .update-list{gap:0}');
 expect(css).toContain('padding-bottom:calc(var(--s4) + env(safe-area-inset-bottom,0))');
 expect(css).toMatch(/\.assistant-send:disabled\{opacity:1;background:var\(--surface-subtle\);color:var\(--text-muted\);border:1px/);
 const touch=css; // Later coarse pointer rules may supplement these shared touch targets.
 expect(touch).toMatch(/\.inline-hint \.button[^}]*min-height:44px;min-width:44px/);
 expect(touch).toMatch(/\.public-footer a[^}]*min-width:44px;min-height:44px/);
 expect(touch).toMatch(/\.settings-page form>\.queue-check[^}]*min-width:44px;min-height:44px;padding:var\(--s3\)/);
});
