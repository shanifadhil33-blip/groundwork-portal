// @vitest-environment jsdom
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {afterEach, expect, it, vi} from 'vitest';
import {PersonalAgentSettings} from '../components/app/personal-agent-settings';
const state=vi.hoisted(()=>({request:vi.fn(),preferences:{agent_name:null,voice_enabled:false,language:null,reply_length:'normal' as string|undefined}}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/app/context',()=>({useApp:()=>({member:null})}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:state.preferences,loading:false,error:null,reload:vi.fn()})}));
vi.mock('../components/app/translator',()=>({changeAppLanguage:vi.fn()}));
vi.mock('../components/app/dashboard',()=>({AgentLog:()=>null}));
afterEach(()=>{vi.unstubAllGlobals();state.request.mockReset();state.preferences.reply_length='normal';});
for(const length of ['Short','Normal','Detailed'])it(`loads the saved preference and saves ${length} from Agent settings`,async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 state.preferences.reply_length='detailed';state.request.mockResolvedValue({});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>root.render(<PersonalAgentSettings/>));
  const control=host.querySelector<HTMLButtonElement>('#replylength')!;
  expect(control.textContent).toContain('Detailed');
  await act(async()=>control.click());
  const choices=Array.from(document.querySelectorAll<HTMLButtonElement>('[role=menuitemradio]'));
  expect(choices.map(c=>c.textContent)).toEqual(['Short','Normal','Detailed']);
  await act(async()=>choices.find(c=>c.textContent===length)!.click());
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(state.request).toHaveBeenCalledTimes(1);
  const [url,options]=state.request.mock.calls[0];expect(url).toBe('/api/me/preferences');expect(options.method).toBe('PATCH');
  expect(JSON.parse(options.body).reply_length).toBe(length.toLowerCase());
  expect(host.textContent).toContain('Agent settings saved.');
 }finally{await act(async()=>root.unmount());host.remove();}
});
it('shows Normal when an older response has no reply length',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);state.preferences.reply_length=undefined;
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<PersonalAgentSettings/>));expect(host.querySelector('#replylength')?.textContent).toContain('Normal');}
 finally{await act(async()=>root.unmount());host.remove();}
});
