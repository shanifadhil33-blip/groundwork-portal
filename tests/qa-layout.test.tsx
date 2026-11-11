import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { AppContext, type Membership } from '../components/app/context';
import { NoAccess } from '../components/app/no-access';
import { ClientHome } from '../components/app/client-home';
import { Dashboard } from '../components/app/dashboard';
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,reload:()=>{},data:url?.includes('/work-orders')?{total:1,data:[{id:'order',order_number:1,title:'Repair entry door',status:url.includes('status=done')?'done':'open',updated_at:'2026-10-10T12:00:00Z',due_on:null}]}:url?.includes('/dashboard')?{by_status:{open:1},overdue:13,waiting_on_parts:3,pending_queue_rows:2}:url?.includes('/supplier/sync-runs')?[]: {data:[]}})}));
const member:Membership={workspace_id:'workspace',workspace_name:'Ridgeline',role:'client',client_id:'client',client_name:'Harbor & Pine'};
function render(element:React.ReactNode,role:Membership['role']='client') {return renderToStaticMarkup(<AppContext.Provider value={{member:{...member,role},workspace:{id:'workspace',name:'Ridgeline',timezone:'Asia/Dubai',is_demo:true,country:'AE',region:null,currency:'AED'},me:{user:{id:'user',name:'Pranav',email:'pranav@example.com',image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}>{element}</AppContext.Provider>);}
it('offers sign in without a dashboard loop when signed out',()=>{
 const html=renderToStaticMarkup(<NoAccess/>);
 expect(html).toContain('href="/sign-in"');expect(html).toContain('Sign in');expect(html).toContain('Go back');expect(html).not.toContain('/dashboard');
 expect(render(<NoAccess/>)).toContain('Go to Home');expect(render(<NoAccess/>)).toContain('This page is for your maintenance company’s team.');expect(render(<NoAccess/>,'admin')).toContain('Go to Home');
});
it('shows the client Home as Your requests with Open and Done groups and no duplicate lists',()=>{
 const html=render(<ClientHome/>);
 expect(html).toContain('page client-home');expect(html).toContain('<h1>Your requests</h1>');
 expect(html).toContain('<h2>Open</h2>');expect(html).toContain('<h2>Done</h2>');
 expect(html).toContain('Repair entry door');
 for(const gone of ['Recent updates','Recent completed jobs','Needs action','View all past records','Request Received'])expect(html).not.toContain(gone);
});
it('shows actionable records instead of dashboard count tiles',()=>{
 const html=render(<Dashboard/>,'admin');
 expect(html).toContain('<h2>Needs action</h2>');expect(html).toContain('Repair entry door');
 expect(html).toContain('/work-orders/order');expect(html).not.toContain('class="tile');expect(html).not.toContain('stat-strip');
});
it('defines warm canvases in the tokens file and prevents badge stretching in flex columns',()=>{
 const tokens=readFileSync(new URL('../app/tokens.css',import.meta.url),'utf8'),css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8').replace(/\s+/g,'');
 expect(tokens).toMatch(/:root \{[^}]*--bg: #F6F5F2;\s*--surface: #FFFFFF/);
 expect(tokens).toMatch(/\[data-theme='dark'\] \{[^}]*--bg: #151412;\s*--surface: #1E1C19/);
 expect(css).toMatch(/\.badge\{[^}]*align-self:flex-start;[^}]*width:max-content/);
});
