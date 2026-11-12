// @vitest-environment jsdom
// Oct 19 open bugs: a card that creates a request said "Confirm this change", and the household card was one block
// marked do not translate, so its labels stayed English for a Malayalam or Arabic speaker. Labels translate now; his own
// words, his home's name and anything he typed stay exactly as written.
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {Assistant} from '../components/app/assistant';
import {AppContext,type Membership} from '../components/app/context';
const api=vi.hoisted(()=>({post:vi.fn(),wide:false,voice:false}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:api.post}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{agent_name:null,voice_enabled:api.voice,language:'en-IN'}})}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),BottomSheet:(await import('../components/ui/dialog')).BottomSheet}));
vi.mock('../components/app/translator',()=>({changeAppLanguage:vi.fn()}));
let host:HTMLDivElement,root:Root,page:HTMLDivElement,signals:AbortSignal[];
/** A question that never answers until it is cancelled, like a slow free model. */
function hang(){api.post.mockImplementation((_url:string,_body:unknown,init?:{signal?:AbortSignal})=>new Promise((_,reject)=>{if(init?.signal){signals.push(init.signal);init.signal.addEventListener('abort',async()=>{const {RequestError}=await import('../lib/ui/api');reject(new RequestError(0,'Stopped.',undefined,'aborted'));});}}));}
beforeEach(()=>{
 sessionStorage.clear();localStorage.clear();api.post.mockReset();api.wide=false;api.voice=false;signals=[];
 page=document.createElement('div');page.className='page-behind';document.body.append(page);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 vi.stubGlobal('matchMedia',(q:string)=>({matches:q.includes('min-width: 1024px')?api.wide:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
 Element.prototype.scrollIntoView=vi.fn();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();page.remove();document.body.innerHTML='';vi.useRealTimers();vi.unstubAllGlobals();});
async function mount(onClose=vi.fn()){
 const member:Membership={workspace_id:'workspace',workspace_name:'Company',role:(api as any).role??'technician',client_id:null,client_name:null};
 await act(async()=>root.render(<AppContext.Provider value={{member,workspace:null,me:{user:{id:'ravi',name:'Ravi',email:null,image:null},memberships:[member]},reload:()=>{},updateName:()=>{}}}><Assistant ws="workspace" open onClose={onClose}/></AppContext.Provider>));
 return onClose;
}
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label||b.getAttribute('aria-label')===label) as HTMLButtonElement|undefined;
const field=()=>document.querySelector('#assistant-input') as HTMLTextAreaElement;
async function type(value:string){const f=field();const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!;await act(async()=>{set.call(f,value);f.dispatchEvent(new Event('input',{bubbles:true}));});}
async function ask(label='Show jobs waiting on parts'){await act(async()=>button(label)!.click());}


const card=()=>document.querySelector('.pending-reply') as HTMLElement;
it('household card: heading New request, labels translatable, his words and typed answers kept as written, tapped choices translatable',async()=>{
 (api as any).role='client';
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'a1',tool:'household_request',household:true,words:'എസി തണുക്കുന്നില്ല',summary:'Home maintenance request\nഎസി',why:'Nothing is sent until you tap Yes.',fields:{title:'Home maintenance request',words:'എസി തണുക്കുന്നില്ല',home:'Villa 12',where:'Bedroom',since:'കഴിഞ്ഞ ആഴ്ച',photos:1,visit_charge:{amount:150,currency:'AED',sample:true}}}});
 await mount();await type('എസി തണുക്കുന്നില്ല');await act(async()=>button('Send')!.click());
 expect(card().querySelector('h3')!.textContent).toBe('New request');
 expect(card().closest('[data-no-translate]')).toBeNull();
 const dts=[...card().querySelectorAll('dt')];expect(dts.map(d=>d.textContent)).toEqual(['Your home','Where','Since','Photos','Visit charge']);
 for(const d of dts)expect(d.closest('[data-no-translate]')).toBeNull();
 const dd=[...card().querySelectorAll('dd')];
 expect(dd[0].textContent).toBe('Villa 12');expect(dd[0].hasAttribute('data-no-translate')).toBe(true);
 expect(dd[1].textContent).toBe('Bedroom');expect(dd[1].hasAttribute('data-no-translate')).toBe(false);
 expect(dd[2].textContent).toBe('കഴിഞ്ഞ ആഴ്ച');expect(dd[2].hasAttribute('data-no-translate')).toBe(true);
 expect(dd[3].textContent).toBe('1');expect(dd[4].textContent).toBe('AED 150.00 (Sample price)');
 expect(card().querySelector('p.preserve[data-no-translate]')!.textContent).toBe('എസി തണുക്കുന്നില്ല');
 (api as any).role=undefined;
});
it('a staff request card says New request; a real change keeps Confirm this change',async()=>{
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'b1',tool:'create_request',summary:'Create a request for the lobby light.'}});
 await mount();await type('lobby light is out');await act(async()=>button('Send')!.click());
 expect(card().querySelector('h3')!.textContent).toBe('New request');
 await act(async()=>root.unmount());root=createRoot(host);
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'b2',tool:'set_priority',summary:'Make this job urgent.'}});
 await mount();await type('make it urgent');await act(async()=>button('Send')!.click());
 expect(card().querySelector('h3')!.textContent).toBe('Confirm this change');
});
it('a household card with nothing given says Not given in the app language',async()=>{
 (api as any).role='client';
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'c1',tool:'household_request',household:true,words:'leak',summary:'x',fields:{title:'Home maintenance request',words:'leak',home:null,where:null,since:null,photos:0}}});
 await mount();await type('leak');await act(async()=>button('Send')!.click());
 const dd=[...card().querySelectorAll('dd')];
 expect(dd[4].textContent).toBe('The office will confirm the price.');
 expect(dd.slice(0,3).map(d=>d.textContent)).toEqual(['Not given','Not given','Not given']);
 for(const d of dd)expect(d.hasAttribute('data-no-translate')).toBe(false);
 (api as any).role=undefined;
});
it('a quick answer he tapped can be translated in his bubble; what he typed stays as written',async()=>{
 (api as any).role='client';
 api.post.mockResolvedValueOnce({available:true,reply:'Where in your home is the problem?',choices:['Kitchen','Bathroom']}).mockResolvedValueOnce({available:true,reply:'Since when has this been happening?',choices:['Today']});
 await mount();await type('ماء تحت المغسلة');await act(async()=>button('Send')!.click());
 await act(async()=>button('Kitchen')!.click());
 const users=[...document.querySelectorAll('.assistant-message.user')] as HTMLElement[];
 expect(users.map(u=>u.textContent)).toEqual(['ماء تحت المغسلة','Kitchen']);
 expect(users[0].hasAttribute('data-no-translate')).toBe(true);
 expect(users[1].hasAttribute('data-no-translate')).toBe(false);
 (api as any).role=undefined;
});

it('household card shows the amount without a sample label for a real price',async()=>{
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'price',tool:'household_request',household:true,summary:'x',fields:{words:'leak',home:null,where:null,since:null,photos:0,visit_charge:{amount:200,currency:'AED',sample:false}}}});
 await mount();await type('leak');await act(async()=>button('Send')!.click());
 expect([...card().querySelectorAll('dd')].at(-1)?.textContent).toBe('AED 200.00');
 expect(card().textContent).not.toContain('Example price, not final');
});

it('quote visit card shows site, charge and price explanation before Yes without sending a request',async()=>{
 (api as any).role='client';
 api.post.mockResolvedValueOnce({available:true,pending_action:{id:'quote',tool:'quote_visit',quote_visit:true,summary:'Price visit',why:'Nothing is sent until you tap Yes.',fields:{words:'How much to fix the water heater?',home:'Marina Exchange',visit_charge:{amount:200,currency:'AED',sample:false}}}});
 await mount();await type('Price visit');await act(async()=>button('Send')!.click());
 expect(card().querySelector('h3')?.textContent).toBe('Price visit');
 expect(card().textContent).toContain('AED 200.00');expect(card().textContent).toContain('The full price depends on what the technician finds.');
 expect(card().querySelector('[data-no-translate]')?.textContent).toBe('How much to fix the water heater?');
 expect(api.post).toHaveBeenCalledOnce();expect(button('Yes')).toBeTruthy();expect(button('Change')).toBeTruthy();
});
