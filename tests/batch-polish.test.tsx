import React from 'react';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
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
  function scan(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{const file=join(dir,entry.name);return entry.isDirectory()?scan(file):/\.[jt]sx?$/.test(file)&&/value: ?''[^}]*label: ?['`]Choose/.test(read(file))?[file]:[];});}
  expect(['app','components'].flatMap(scan)).toEqual([]);
});

it('adds a sticky search to any list longer than 15, and a trigger wide panel', () => {
  expect(SEARCH_AFTER).toBe(15);
  const src = read('components/ui/dropdown.tsx');
  expect(src).toContain('options.length > SEARCH_AFTER');
  expect(src).toContain('Math.max(r.width, menuWidth ?? 0)');
  const css = read('app/globals.css');
  expect(css).toMatch(/\.dropdown-search \{\s*position: sticky;[^}]*background: var\(--surface\)/);
  // menus and sheets enter with transitions from the tokens, never with a keyframe fade
  expect(css).not.toMatch(/animation:\s*fade/);
});

it('lands on sign in with a note after signing out, with the form in the first paint', () => {
  expect(read('components/app/shell.tsx')).toContain("window.location.replace('/?signed_out=1')");
  expect(read('app/(public)/sign-in/page.tsx')).toContain('You’re signed out.');
  expect(existsSync('app/(public)/sign-in/loading.tsx')).toBe(false);
});

it('starts the company name empty and calls the settings tab Company', () => {
  const onboarding = read('components/app/guided-onboarding.tsx');
  expect(onboarding).toContain("a.company_name??''"); expect(onboarding).toContain('Company name');
  expect(onboarding).not.toMatch(/>[^<{]*\bworkspace\b/i);
  const groups = read('components/app/settings-groups.tsx'), page = read('app/(app)/settings/page.tsx');
  expect(groups).toContain("{ key: 'company', label: 'Company'"); expect(page).toContain("workspace: '/settings/company'");
});

it('renders the getting started checklist complete in the first paint', () => {
  const member:Membership={workspace_id:'ws',workspace_name:'Acme',role:'admin'} as Membership;
  const html = renderToStaticMarkup(<AppContext.Provider value={{member,workspace:{id:'ws',name:'Acme',timezone:'Asia/Muscat',is_demo:false,country:'OM',region:null,currency:'OMR'},me:{user:{id:'u',name:'A',email:'a@x.test'},memberships:[member]},refresh:async()=>{},setWorkspace:()=>{}} as never}><Dashboard firstUse /></AppContext.Provider>);
  expect(html).toContain('Hide checklist'); expect(html).toContain('Set your country and region'); expect(html).toContain('Get started'); expect(html).toContain('Add your company documents'); expect(html).not.toMatch(/API key/);
});
