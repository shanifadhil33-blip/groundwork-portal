// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Assistant } from '../components/app/assistant';
import { AppContext, type Membership } from '../components/app/context';
import { designCopyFallbacks } from '../lib/ui/design-copy';
import { LANGUAGES } from '../lib/languages';
const api=vi.hoisted(()=>({post:vi.fn()}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:api.post}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{agent_name:null,voice_enabled:true,language:'en-IN'}})}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),BottomSheet:({open,children,footer,title}:any)=>open?<section role="dialog" aria-label={title}>{children}{footer}</section>:null}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 sessionStorage.clear();api.post.mockReset();host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false}));
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(role:Membership['role'],docked=true){
 const member:Membership={workspace_id:'workspace',workspace_name:'Company',role,client_id:role==='client'?'client':null,client_name:null};
 await act(async()=>root.render(<AppContext.Provider value={{member,workspace:null,me:{user:{id:'user',name:'Imran',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}><Assistant ws="workspace" open={!docked} docked={docked} onClose={()=>{}}/></AppContext.Provider>));
}
async function click(label:string){const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===label||b.getAttribute('aria-label')===label);expect(button).toBeTruthy();await act(async()=>button!.click());}
for(const role of ['admin','staff','technician','client'] as const){
 it(`${role} confirms with Yes inside the reply using the existing backend`,async()=>{
  api.post.mockResolvedValueOnce({available:true,pending_action:{id:'approval',summary:'Save this job change?',why:'Requested by you.'}}).mockResolvedValueOnce({available:true,reply:'Saved.'});
  await mount(role);await click('Show jobs waiting on parts');
  const reply=host.querySelector('.pending-reply');expect(reply?.textContent).toContain('Save this job change?');expect(reply?.textContent).toContain('YesChange');
  expect(host.querySelectorAll('.assistant-control')).toHaveLength(2);
  await click('Yes');expect(api.post).toHaveBeenLastCalledWith('/api/workspaces/workspace/assistant',{messages:[],confirm_action_id:'approval'});expect(host.textContent).toContain('Saved.');expect(host.querySelector('.pending-reply')).toBeNull();
 });
}
it('Change restores the request for editing without applying the pending action',async()=>{
 api.post.mockResolvedValue({available:true,pending_action:{id:'approval',summary:'Save this change?'}});
 await mount('client',false);await click('Show jobs waiting on parts');await click('Change');
 expect(api.post).toHaveBeenCalledTimes(1);expect(host.querySelector('textarea')?.value).toBe('Show jobs waiting on parts');expect(host.querySelector('.pending-reply')).toBeNull();expect(host.textContent).toContain('No change was made.');
});
it('keeps server choice answers inside the agent reply',async()=>{
 api.post.mockResolvedValue({available:true,reply:'Save this report?',choices:['Yes','Change']});await mount('technician');await click('Show jobs waiting on parts');
 expect(host.querySelector('article.assistant')?.textContent).toContain('Save this report?YesChange');await click('Change');expect(api.post.mock.calls[1][1].messages.at(-1)).toEqual({role:'user',content:'Change'});
});
it('handles an unavailable microphone without sending or losing the draft',async()=>{
 await mount('admin');await click('Use microphone');expect(host.textContent).toContain('Voice input is unavailable in this browser.');expect(api.post).not.toHaveBeenCalled();
});
it('registers all new assistant source keys in every supported locale',()=>{
 for(const locale of LANGUAGES)for(const key of ['Agent','Yes','Change','Use microphone','Stop recording','Ask Agent or speak'])expect(designCopyFallbacks[locale.code][key]).toBeTruthy();
});
it('dictation fills a draft without submitting and stops when chat closes',async()=>{
 const speech={lang:'',interimResults:false,onresult:null as null|((event:any)=>void),onerror:null,onend:null as null|(()=>void),start:vi.fn(),stop:vi.fn(),abort:vi.fn()};
 Object.defineProperty(window,'SpeechRecognition',{configurable:true,value:class{constructor(){return speech;}}});
 try{await mount('technician');await click('Use microphone');expect(speech.start).toHaveBeenCalledOnce();
 await act(async()=>{speech.onresult?.({results:[[{transcript:'I fixed the pump'}]]});speech.onend?.();});
 expect(host.querySelector('textarea')?.value).toBe('I fixed the pump');expect(api.post).not.toHaveBeenCalled();
 await act(async()=>root.unmount());expect(speech.abort).toHaveBeenCalled();root=createRoot(host);
 }finally{Reflect.deleteProperty(window,'SpeechRecognition');}
});
