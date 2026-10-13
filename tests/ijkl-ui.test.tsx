// @vitest-environment jsdom
import React,{act} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach,expect,it,vi } from 'vitest';
import { ContactNamesProvider } from '../components/app/contact-names-context';
import { ContactName,ContactText } from '../components/app/contact-name';
import { GuidedOnboarding } from '../components/app/guided-onboarding';
import { OnboardingHelper } from '../components/app/onboarding-helper';
import { request,post } from '../lib/ui/api';
const state=vi.hoisted(()=>({demo:false,step:'language',reload:vi.fn().mockResolvedValue(undefined)}));
vi.mock('../components/ui/lazy-dialog',async()=>await import('../components/ui/dialog'));
vi.mock('../components/app/context',async original=>({...await original<typeof import('../components/app/context')>(),useApp:()=>({member:{role:'admin',workspace_id:'workspace'},workspace:{is_demo:state.demo},me:{user:{id:'viewer',name:'Bilal',email:'bilal@example.test'}},reload:state.reload})}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:[{user_id:'target',name:'Sam at Tower 3',real_name:'Sam',nickname:'Sam at Tower 3',role:'client',client_kind:'manager'}],loading:false,error:null,reload:state.reload})}));
vi.mock('../lib/ui/api',()=>({request:vi.fn().mockImplementation(async(_url,init)=>init?{step:'identity',answers:{language:'en-IN'}}:{step:'language',answers:{language:'en-IN'}}),post:vi.fn(),RequestError:class extends Error{}}));
let host:HTMLDivElement,root:ReturnType<typeof createRoot>;
async function render(node:React.ReactNode){vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(node));}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();document.body.innerHTML='';vi.clearAllMocks();state.demo=false;vi.unstubAllGlobals();});
it('tapping a saved name reveals the real name and a personal name editor',async()=>{
 await render(<ContactNamesProvider><ContactName name="Sam" userId="target"/></ContactNamesProvider>);
 expect(host.textContent).toContain('Sam at Tower 3');expect(host.querySelector('[title="Real name: Sam"]')).toBeTruthy();expect(vi.mocked(request)).not.toHaveBeenCalled();
 await act(async()=>(host.querySelector('[role="button"]') as HTMLElement).click());expect(document.body.textContent).toContain('Real name: Sam');expect(document.body.textContent).toContain('Facility manager');expect(document.body.textContent).toContain('Save as...');expect(document.body.textContent).toContain('This name is saved for you only.');
 const save=[...document.body.querySelectorAll('button')].find(b=>b.textContent==='Save name')!;await act(async()=>save.click());expect(vi.mocked(request)).toHaveBeenCalledWith('/api/workspaces/workspace/contact-names/target',expect.objectContaining({method:'PATCH',body:JSON.stringify({nickname:'Sam at Tower 3'})}));
});
it('Agent text uses the same tappable identity',async()=>{
 await render(<ContactNamesProvider><ContactText text="Sam at Tower 3 has two jobs. Sam can help."/></ContactNamesProvider>);expect(host.querySelectorAll('[role="button"]')).toHaveLength(2);expect(host.textContent).toBe('Sam at Tower 3 has two jobs. Sam at Tower 3 can help.');
});
it('setup asks language first, has progress dots and saves before moving to the next question',async()=>{
 await render(<GuidedOnboarding/>);expect(host.querySelector('h1')?.textContent).toBe('Which language do you use?');expect(host.textContent).not.toContain('Your name');expect(host.querySelector('a[href="/dashboard"]')?.textContent).toBe('Do this later');expect(host.querySelectorAll('.onboarding-steps li').length).toBeGreaterThan(5);
 const next=[...host.querySelectorAll('button')].find(b=>b.textContent==='Continue')!;await act(async()=>next.click());expect(vi.mocked(request)).toHaveBeenCalledWith('/api/onboarding',expect.objectContaining({method:'PATCH'}));expect(host.querySelector('h1')?.textContent).toBe('Who are you?');expect(host.textContent).toContain('Start a new company');expect(host.textContent).toContain('Join my company’s team');expect(host.textContent).toContain('Customer of a maintenance company');
});
it('demo sign ins skip setup and do not read onboarding progress',async()=>{state.demo=true;await render(<GuidedOnboarding/>);expect(host.textContent).toContain('Your demo is ready');expect(vi.mocked(request)).not.toHaveBeenCalled();});
it('setup Agent uses Yes and Change without saving when the user chooses Change',async()=>{
 vi.mocked(post).mockResolvedValue({reply:'Review these answers.',pending_action:{id:'proposal',summary:'Company name: Bilal Works'}});
 await render(<OnboardingHelper/>);const help=[...host.querySelectorAll('button')].find(b=>b.textContent==='Ask Agent for help')!;await act(async()=>help.click());
 const field=host.querySelector('textarea')!;await act(async()=>{const setter=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;setter.call(field,'My company is Bilal Works');field.dispatchEvent(new Event('input',{bubbles:true}));});
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Send')!.click());expect(host.textContent).toContain('Company name: Bilal Works');expect(host.textContent).toContain('Yes');await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Change')!.click());expect(vi.mocked(post)).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('Change your answers');
});
