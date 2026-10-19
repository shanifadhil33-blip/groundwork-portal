// @vitest-environment jsdom
// Adhil, Oct 19: while the Agent thinks nothing is blocked. Close always works and cancels the question, the text box
// stays usable, the send button becomes Stop, a slow answer stops with a friendly line, and on a laptop the page is never covered.
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Assistant} from '../components/app/assistant';
import {AppContext,type Membership} from '../components/app/context';
const api=vi.hoisted(()=>({post:vi.fn(),wide:false}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:api.post}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{agent_name:null,voice_enabled:false,language:'en-IN'}})}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),BottomSheet:(await import('../components/ui/dialog')).BottomSheet}));
vi.mock('../components/app/translator',()=>({changeAppLanguage:vi.fn()}));
let host:HTMLDivElement,root:Root,page:HTMLDivElement,signals:AbortSignal[];
/** A question that never answers until it is cancelled, like a slow free model. */
function hang(){api.post.mockImplementation((_url:string,_body:unknown,init?:{signal?:AbortSignal})=>new Promise((_,reject)=>{if(init?.signal){signals.push(init.signal);init.signal.addEventListener('abort',async()=>{const {RequestError}=await import('../lib/ui/api');reject(new RequestError(0,'Stopped.',undefined,'aborted'));});}}));}
beforeEach(()=>{
 sessionStorage.clear();localStorage.clear();api.post.mockReset();api.wide=false;signals=[];
 page=document.createElement('div');page.className='page-behind';document.body.append(page);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('matchMedia',(q:string)=>({matches:q.includes('min-width: 1024px')?api.wide:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();page.remove();document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(onClose=vi.fn()){
 const member:Membership={workspace_id:'workspace',workspace_name:'Company',role:'technician',client_id:null,client_name:null};
 await act(async()=>root.render(<AppContext.Provider value={{member,workspace:null,me:{user:{id:'ravi',name:'Ravi',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}><Assistant ws="workspace" open onClose={onClose}/></AppContext.Provider>));
 return onClose;
}
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label||b.getAttribute('aria-label')===label) as HTMLButtonElement|undefined;
const field=()=>document.querySelector('#assistant-input') as HTMLTextAreaElement;
async function type(value:string){const f=field();const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;await act(async()=>{set.call(f,value);f.dispatchEvent(new Event('input',{bubbles:true}));});}
async function ask(label='Show jobs waiting on parts'){await act(async()=>button(label)!.click());}

it('while thinking, close works and cancels the question, the box takes the next message, and send becomes Stop',async()=>{
 hang();const onClose=await mount();await ask();
 expect(document.querySelector('.agent-typing')?.textContent).toContain('Thinking');
 expect(button('Close dialog')!.disabled).toBe(false);
 expect(field().disabled).toBe(false);
 await type('and the late ones');expect(field().value).toBe('and the late ones');
 expect(button('Stop')).toBeTruthy();expect(button('Send')).toBeUndefined();
 // Enter while it thinks keeps his draft and sends nothing new.
 await act(async()=>field().dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(api.post).toHaveBeenCalledTimes(1);expect(field().value).toBe('and the late ones');
 await act(async()=>button('Close dialog')!.click());await act(async()=>new Promise(r=>setTimeout(r,250)));
 expect(onClose).toHaveBeenCalledOnce();expect(signals[0].aborted).toBe(true);
});
it('Escape closes while thinking',async()=>{
 hang();const onClose=await mount();await ask();
 await act(async()=>document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));await act(async()=>new Promise(r=>setTimeout(r,250)));
 expect(onClose).toHaveBeenCalledOnce();expect(signals[0].aborted).toBe(true);
});
it('Stop cancels the question, keeps the chat and draft, and the next message sends',async()=>{
 hang();await mount();await ask();await type('next one');
 await act(async()=>button('Stop')!.click());await act(async()=>Promise.resolve());
 expect(signals[0].aborted).toBe(true);expect(document.body.textContent).toContain('Stopped. Ask again when you are ready.');
 expect(document.querySelector('.agent-typing')).toBeNull();expect(field().value).toBe('next one');expect(document.body.textContent).toContain('Show jobs waiting on parts');
 api.post.mockReset();api.post.mockResolvedValueOnce({available:true,reply:'Two jobs are late.'});
 await act(async()=>button('Send')!.click());
 expect(api.post).toHaveBeenCalledTimes(1);expect(api.post.mock.calls[0][1].messages.at(-1)).toEqual({role:'user',content:'next one'});expect(document.body.textContent).toContain('Two jobs are late.');
});
it('a slow answer shows progress, then stops at 48 seconds with a friendly line and a retry',async()=>{
 vi.useFakeTimers({toFake:['setTimeout','clearTimeout']});hang();await mount();await ask();
 await act(async()=>{vi.advanceTimersByTime(8100);});expect(document.querySelector('.agent-typing')?.textContent).toContain('Still working on it');
 await act(async()=>{vi.advanceTimersByTime(40_000);});await act(async()=>Promise.resolve());
 expect(signals[0].aborted).toBe(true);expect(document.body.textContent).toContain('This is taking too long, so I stopped waiting. Please try again.');
 expect(document.querySelector('.agent-typing')).toBeNull();expect(field().disabled).toBe(false);
});
it('on a phone the panel is full screen and modal, yet close still works while thinking',async()=>{
 hang();await mount();await ask();
 expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBe('true');expect(page.inert).toBe(true);
 expect(button('Close dialog')!.disabled).toBe(false);
});
it('on a laptop the panel never covers or locks the page behind it',async()=>{
 api.wide=true;hang();await mount();await ask();
 const layer=document.querySelector('.modal-layer')!;expect(layer.classList.contains('non-modal')).toBe(true);
 expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-modal')).toBeNull();expect(page.inert).toBeFalsy();expect(document.body.style.overflow).not.toBe('hidden');
 // Focus can move to the page while the Agent thinks; it is not pulled back into the panel.
 const other=document.createElement('button');page.append(other);await act(async()=>other.focus());expect(document.activeElement).toBe(other);
});
it('a new message while a card waits says no to that card and sends, instead of being blocked',async()=>{
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'card',summary:'Save this change?'}}).mockResolvedValueOnce({}).mockResolvedValueOnce({available:true,reply:'Okay.'});
 await mount();await ask();expect(document.querySelector('.pending-reply')).toBeTruthy();expect(field().disabled).toBe(false);
 await type('actually show late jobs');await act(async()=>button('Send')!.click());
 expect(api.post.mock.calls.some((c:any[])=>/\/assistant\/log\/card\/decline$/.test(c[0]))).toBe(true);
 expect(api.post.mock.calls.some((c:any[])=>c[1]?.confirm_action_id)).toBe(false);expect(document.body.textContent).toContain('Okay.');
});
