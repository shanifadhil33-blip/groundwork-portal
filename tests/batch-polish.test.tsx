import React from 'react';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { Dropdown, SEARCH_AFTER } from '../components/ui/dropdown';
import { AppContext, type Membership } from '../components/app/context';
vi.mock('next/navigation',()=>({useRouter:()=>({push(){},replace(){},refresh(){},prefetch(){}}),usePathname:()=>'/dashboard',useSearchParams:()=>new URLSearchParams()}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,reload:()=>{},data:url?.endsWith('/dashboard')?{by_status:{}}:[]})}));
import { Dashboard } from '../components/app/dashboard';
const read=(p:string)=>readFileSync(p,'utf8');

it('shows a placeholder on the trigger instead of offering it as an option', () => {
  const html = renderToStaticMarkup(<Dropdown label="Governorate" placeholder="Choose a governorate" options={[{value:'Muscat',label:'Muscat'}]} onChange={()=>{}} value="" />);
  expect(html).toContain('Choose a governorate'); expect(html).toContain('dropdown-placeholder');
});

it('never lists a pure "Choose ..." placeholder as a selectable option', () => {
  const hits = execSync(`grep -rnE "value: ?''[^}]*label: ?['\\\`]Choose" app components || true`, { encoding: 'utf8' });
  expect(hits.trim()).toBe('');
});

it('adds a sticky search to any list longer than 15, and a trigger wide panel', () => {
  expect(SEARCH_AFTER).toBe(15);
  const src = read('components/ui/dropdown.tsx');
  expect(src).toContain('options.length > SEARCH_AFTER');
  expect(src).toContain('Math.max(r.width, menuWidth ?? 0)');
  const css = read('app/globals.css');
  expect(css).toMatch(/\.dropdown-search\{position:sticky;[^}]*background:var\(--surface\)/);
  // menus and sheets slide in opaque; they never fade in over the page
  expect(css).not.toMatch(/\.dropdown-menu[^{]*\{[^}]*animation:fade/);
  expect(css).not.toMatch(/\.dialog\{[^}]*animation:fade/);
});

it('lands on sign in with a note after signing out, with the form in the first paint', () => {
  expect(read('components/app/shell.tsx')).toContain("window.location.replace('/sign-in?signed_out=1')");
  expect(read('app/(public)/sign-in/page.tsx')).toContain('You’re signed out.');
  expect(existsSync('app/(public)/sign-in/loading.tsx')).toBe(false);
});

it('starts the company name empty and calls the settings tab Company', () => {
  const onboarding = read('app/(app)/onboarding/page.tsx');
  expect(onboarding).toContain("useState('')"); expect(onboarding).toContain('placeholder="Your company name"');
  expect(onboarding).not.toContain("workspace'");
  const settings = read('components/app/settings.tsx');
  expect(settings).toContain("{value:'company',label:'Company'"); expect(settings).toContain("requested==='workspace'?'company'");
});

it('renders the getting started checklist complete in the first paint', () => {
  const member:Membership={workspace_id:'ws',workspace_name:'Acme',role:'admin'} as Membership;
  const html = renderToStaticMarkup(<AppContext.Provider value={{member,workspace:{id:'ws',name:'Acme',timezone:'Asia/Muscat',is_demo:false,country:'OM',region:null,currency:'OMR'},me:{user:{id:'u',name:'A',email:'a@x.test'},memberships:[member]},refresh:async()=>{},setWorkspace:()=>{}} as never}><Dashboard firstUse /></AppContext.Provider>);
  expect(html).toContain('Hide checklist'); expect(html).toContain('Set your country and region'); expect(html).toContain('Get started'); expect(html).toContain('Add your company documents'); expect(html).not.toMatch(/API key/);
});
