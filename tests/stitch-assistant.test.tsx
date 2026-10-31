// @vitest-environment jsdom
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { AppWords } from '../components/app/app-words';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../components/ui/theme';
import { changeAppLanguage } from '../components/app/translator';
import { Assistant } from '../components/app/assistant';
import { AppContext, type Membership } from '../components/app/context';
import { designCopyFallbacks } from '../lib/ui/design-copy';
import { LANGUAGES } from '../lib/languages';
vi.mock('../components/app/job-photos',()=>({shrinkPhoto:async()=>({data:'photo',mime:'image/jpeg',width:1,height:1})}));
const api=vi.hoisted(()=>({post:vi.fn(),preferences:{agent_name:null as string|null,voice_enabled:true,language:'en-IN'}}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:api.post}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:api.preferences})}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),BottomSheet:({open,children,footer,title}:any)=>open?<section role="dialog"><h2>{title}</h2>{children}{footer}</section>:null}));
vi.mock('../components/app/translator',()=>({changeAppLanguage:vi.fn()}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 sessionStorage.clear();api.post.mockReset();api.preferences.agent_name=null;api.preferences.voice_enabled=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false}));
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
async function mount(role:Membership['role'],docked=true,themed=false){
 const member:Membership={workspace_id:'workspace',workspace_name:'Company',role,client_id:role==='client'?'client':null,client_name:null};
 const app=<AppContext.Provider value={{member,workspace:null,me:{user:{id:'user',name:'Imran',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}><Assistant ws="workspace" open={!docked} docked={docked} onClose={()=>{}}/></AppContext.Provider>;
 await act(async()=>root.render(themed?<ThemeProvider>{app}</ThemeProvider>:app));
}
async function click(label:string){const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent===label||b.getAttribute('aria-label')===label);expect(button).toBeTruthy();await act(async()=>button!.click());}
for(const role of ['admin','staff','technician','client'] as const){
 it(`${role} confirms with Yes inside the reply using the existing backend`,async()=>{
  api.post.mockResolvedValueOnce({available:true,pending_action:{id:'approval',summary:'Save this job change?',why:'Requested by you.'}}).mockResolvedValueOnce({available:true,reply:'Saved.'});
  await mount(role);await click('Show jobs waiting on parts');
  const reply=host.querySelector('.pending-reply');expect(reply?.textContent).toContain('Save this job change?');expect(reply?.textContent).toContain('YesChange');
  expect(host.querySelectorAll('.assistant-control')).toHaveLength(2);
  await click('Yes');expect(api.post).toHaveBeenLastCalledWith('/api/workspaces/workspace/assistant',{messages:[],confirm_action_id:'approval'},{signal:expect.any(AbortSignal)});expect(host.textContent).toContain('Saved.');expect(host.querySelector('.pending-reply')).toBeNull();
 });
}
it('Change restores the request for editing without applying the pending action',async()=>{
 api.post.mockResolvedValue({available:true,pending_action:{id:'approval',summary:'Save this change?'}});
 await mount('client',false);await click('Show jobs waiting on parts');await click('Change');
 // AGENT05: Change only records that he said no; it never confirms the action.
 expect(api.post).toHaveBeenCalledTimes(2);expect(api.post.mock.calls[1][0]).toMatch(/\/assistant\/log\/approval\/decline$/);expect(api.post.mock.calls.some((c:any[])=>c[1]?.confirm_action_id)).toBe(false);expect(host.querySelector('textarea')?.value).toBe('Show jobs waiting on parts');expect(host.querySelector('.pending-reply')).toBeNull();expect(host.textContent).toContain('No change was made.');
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

it('links the custom name from both chat headers and respects voice off',async()=>{
 api.preferences.agent_name='Omar';api.preferences.voice_enabled=false;await mount('admin');
 expect(host.querySelector('.assistant-panel-header a')?.textContent).toBe('Omar');expect(host.querySelector('.assistant-panel-header a')?.getAttribute('href')).toBe('/settings/agent');expect(host.querySelector('[aria-label="Use microphone"]')).toBeNull();
 await mount('admin',false);expect(host.querySelector('[role="dialog"] h2 a')?.textContent).toBe('Omar');expect(host.querySelector('[role="dialog"] h2 a')?.getAttribute('href')).toBe('/settings/agent');
});

const refusalOffer={to_name:'Sam',label:'Ask Sam',question:'Ravi asked to give WO 58 to Yusuf. Can you help?',proposed:'Assign WO 58 to Yusuf',work_order_id:'job'};
it('sends a refusal offer once, protects the name, and keeps the sent line after reopening',async()=>{
 api.post.mockResolvedValueOnce({available:true,reply:"I can't change that. I can ask Sam for you.",offers:[refusalOffer],choices:['Thanks']});
 await mount('technician');await click('Show jobs waiting on parts');
 const button=Array.from(host.querySelectorAll('button')).find(b=>b.textContent==='Ask Sam')!;
 expect(button.style.minHeight).toBe('44px');expect(button.querySelector('[data-no-translate]')?.textContent).toBe('Sam');
 let finish!:(value:unknown)=>void;api.post.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 await act(async()=>{button.click();button.click();});
 expect(button.disabled).toBe(true);expect(button.getAttribute('aria-busy')).toBe('true');expect(api.post).toHaveBeenCalledTimes(2);
 expect(api.post).toHaveBeenLastCalledWith('/api/workspaces/workspace/agent-questions',{question:refusalOffer.question,proposed:refusalOffer.proposed,work_order_id:'job'});
 await act(async()=>finish({id:'question',status:'open'}));
 expect(host.textContent).toContain('Sent to Sam. Nothing changes until he answers.');expect(host.textContent).not.toContain('Ask Sam');
 await mount('technician',false);expect(host.textContent).toContain('Sent to Sam. Nothing changes until he answers.');
 // Offer metadata stays in local chat only; the assistant message schema is unchanged.
 api.post.mockResolvedValueOnce({available:true,reply:'You are welcome.'});await click('Thanks');
 expect(api.post.mock.calls.at(-1)![1].messages.every((m:any)=>Object.keys(m).sort().join(',')==='content,role')).toBe(true);
 await act(async()=>root.unmount());root=createRoot(host);await mount('technician');
 expect(host.textContent).toContain('Sent to Sam. Nothing changes until he answers.');
 expect(host.querySelector('article.assistant [data-no-translate]')?.textContent).toBe('Sam');
});
it('shows a plain retry line for a failed offer and supports another tap in a right to left layout',async()=>{
 host.dir='rtl';api.post.mockResolvedValueOnce({available:true,reply:"I can't change that.",offers:[refusalOffer]}).mockRejectedValueOnce(new Error('private database details')).mockResolvedValueOnce({id:'question'});
 await mount('technician');await click('Show jobs waiting on parts');await click('Ask Sam');
 expect(host.textContent).toContain('Could not send. Tap Ask to try again.');expect(host.textContent).not.toContain('private database details');
 await click('Ask Sam');expect(host.textContent).toContain('Sent to Sam. Nothing changes until he answers.');
 expect(host.querySelector('bdi')?.textContent).toBe('Sam');
});

it('applies an Agent theme receipt and Undo in the page immediately',async()=>{
 localStorage.clear();
 vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 api.post.mockResolvedValueOnce({available:true,reply:'Theme set to Dark (was Light).',choices:['Undo'],setting_change:{setting:'theme',value:'dark'}})
  .mockResolvedValueOnce({available:true,reply:'Theme restored to Light.',choices:[],setting_change:{setting:'theme',value:'light'}});
 await mount('technician',true,true);
 await click('Show jobs waiting on parts');
 expect(document.documentElement.dataset.theme).toBe('dark');expect(host.textContent).toContain('Theme set to Dark (was Light).');expect(host.querySelector('.pending-reply')).toBeNull();
 await click('Undo');expect(document.documentElement.dataset.theme).toBe('light');expect(host.textContent).toContain('Theme restored to Light.');
 localStorage.clear();
});
it('uses the existing language change path for a setting and its Undo',async()=>{
 vi.mocked(changeAppLanguage).mockClear();
 api.post.mockResolvedValueOnce({available:true,reply:'Language set to Hindi (was Default).',choices:['Undo'],setting_change:{setting:'language',value:'hi'}})
  .mockResolvedValueOnce({available:true,reply:'Language restored to Default.',choices:[],setting_change:{setting:'language',value:null}});
 await mount('client');await click('Show jobs waiting on parts');
 expect(changeAppLanguage).toHaveBeenLastCalledWith('hi');await click('Undo');expect(changeAppLanguage).toHaveBeenLastCalledWith(LANGUAGES[0].code);
});

it('household photo offer is optional and confirmation keeps his original words',async()=>{
 const words='المكيف لا يبرد';
 api.post.mockResolvedValueOnce({available:true,reply:'You can add a photo or skip it.',choices:['Skip photo'],household_photo:true})
  .mockResolvedValueOnce({available:true,pending_action:{id:'approval',household:true,words,summary:`Home maintenance request\n${words}\nWhere: Bedroom\nSince: Today\nPhoto: No`}})
  .mockResolvedValueOnce({available:true,reply:'Your request was sent. The company will confirm a time.'});
 await mount('client');await click('Report a problem');
 expect(host.textContent).toContain('Add a photo');
 expect(host.querySelector('input[type="file"]')).toBeTruthy();
 await click('Skip photo');
 const card=host.querySelector('.pending-reply');
 expect(card?.textContent).toContain(words);
 expect(card?.textContent).toContain('Photo: No');
 expect(card?.querySelector('[data-no-translate]')).toBeTruthy();
 expect(api.post.mock.calls.some(([,body])=>body.confirm_action_id)).toBe(false);
 await click('Yes');
 expect(api.post).toHaveBeenLastCalledWith('/api/workspaces/workspace/assistant',{messages:[],confirm_action_id:'approval'},{signal:expect.any(AbortSignal)});
 expect(host.textContent).toContain('The company will confirm a time.');
});

it('household Change restores his words rather than the last tap answer',async()=>{
 api.post.mockResolvedValue({available:true,pending_action:{id:'approval',household:true,words:'water under the sink',summary:'Photo: No'}});
 await mount('client');await click('Report a problem');await click('Change');
 expect((host.querySelector('textarea') as HTMLTextAreaElement).value).toBe('water under the sink');
 expect(api.post.mock.calls.some(([,body])=>body.confirm_action_id)).toBe(false);
});

it('household photo uploads through the shared job photo endpoint before preparing the card',async()=>{
 api.post.mockResolvedValueOnce({available:true,reply:'You can add a photo or skip it.',choices:['Skip photo'],household_photo:true})
  .mockResolvedValueOnce({id:'photo'})
  .mockResolvedValueOnce({available:true,pending_action:{id:'approval',household:true,words:'water under the sink',summary:'water under the sink\nPhoto: Yes'}});
 await mount('client');await click('Report a problem');
 const field=host.querySelector('input[type="file"]') as HTMLInputElement;
 Object.defineProperty(field,'files',{value:[new File(['image'],'photo.jpg',{type:'image/jpeg'})]});
 await act(async()=>field.dispatchEvent(new Event('change',{bubbles:true})));
 expect(api.post).toHaveBeenNthCalledWith(2,'/api/workspaces/workspace/photos',{data:'photo',mime:'image/jpeg',width:1,height:1});
 await click('Continue with photo');
 expect(api.post.mock.calls[2][1].household_photo_ids).toEqual(['photo']);
 expect(host.querySelector('.pending-reply')?.textContent).toContain('Photo: Yes');
 expect(api.post.mock.calls.some(([,body])=>body.confirm_action_id)).toBe(false);
});

it.each(['hi','ar-AE'])('translates the default assistant heading in %s first HTML while preserving a custom name', language => {
 const words = JSON.parse(readFileSync(`public/i18n/${language}.json`, 'utf8'));
 const member:Membership={workspace_id:'workspace',workspace_name:'Company',role:'admin',client_id:null,client_name:null};
 const render = () => renderToStaticMarkup(<AppWords language={language} words={words}><AppContext.Provider value={{member,workspace:null,me:{user:{id:'user',name:'Imran',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}><Assistant ws="workspace" docked open={false} onClose={()=>{}}/></AppContext.Provider></AppWords>);
 for (const name of [null, 'My helper']) {
  api.preferences.agent_name = name;
  const doc = document.createElement('div'); doc.innerHTML = render();
  const heading = doc.querySelector('.agent-heading');
  expect(heading?.textContent).toBe(name ?? words.Agent);
  if (!name) expect(heading?.hasAttribute('data-no-translate')).toBe(false);
 }
});
