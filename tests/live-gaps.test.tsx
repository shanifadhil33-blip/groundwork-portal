// @vitest-environment jsdom
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { AccountIdentity } from '../components/app/account-identity';
import { TodayJobs, LateJobs } from '../components/app/owner-today';
import { AppContext } from '../components/app/context';
import { AppWords } from '../components/app/app-words';
import { ServerLangProvider } from '../components/app/use-ui-lang';
import { InitialResourceProvider } from '../components/app/initial-resources';
const job={id:'job',order_number:25,title:'إصلاح الباب',assignee_name:'Sam',site_name:'Harbor Annex',status:'in_progress',scheduled_for:'2026-11-05T07:00:00Z',due_on:'2020-10-13'};
it('separates account text and excludes decorative initials from the accessible text',()=>{
  const host=document.createElement('div');
  host.innerHTML=renderToStaticMarkup(<AccountIdentity name="Imran" role="المالك"/>);
  expect(host.querySelector('.account-copy')?.children).toHaveLength(2);
  host.querySelector('[aria-hidden=true]')?.remove();
  expect(host.textContent?.trim()).toBe('Imranالمالك');
  expect(host.querySelector('.account-copy strong')?.getAttribute('dir')).toBe('auto');
  expect(host.querySelectorAll('bdi')).toHaveLength(2);
});
it.each([['ar-AE','rtl'],['en-IN','ltr']])('isolates mixed job titles, names, times and statuses in %s', (language,dir)=>{
  const resources=Object.fromEntries(['today=true&sort=scheduled_for&dir=asc&pageSize=10','overdue=true&sort=due_on&dir=asc&pageSize=5'].map(query=>[`/demo/work-orders?${query}`,{data:{data:[job],total:1}}]));
  const host=document.createElement('div');
  host.innerHTML=renderToStaticMarkup(<AppWords language={language} words={{'{first}, {second}':'{first}، {second}'}}><ServerLangProvider language={language}><AppContext.Provider value={{workspace:{timezone:'Asia/Dubai'}} as any}><InitialResourceProvider resources={resources}><TodayJobs base="/demo"/><LateJobs base="/demo"/></InitialResourceProvider></AppContext.Provider></ServerLangProvider></AppWords>);
  for(const row of host.querySelectorAll('.ds-row,.ds-late-row')){
    expect(row.getAttribute('dir')).toBe(dir);
    expect(row.querySelector('strong')?.getAttribute('dir')).toBe('auto');
    expect([...row.querySelectorAll('.ds-sub bdi')].map(n=>n.textContent)).toEqual(['Sam','Harbor Annex']);
    expect(row.textContent).toMatch(/إصلاح الباب Sam، Harbor Annex /);
  }
  expect(host.querySelectorAll('.ds-row,.ds-late-row')).toHaveLength(2);
});
