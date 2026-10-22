// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {PriceChangeCard,WaitingPrices} from '../components/app/price-change';
import {QuoteVisit} from '../components/app/quote-visit';
const state=vi.hoisted(()=>({member:{role:'technician'},request:vi.fn(),toast:vi.fn(),rows:[] as any[]}));
vi.mock('../components/app/context',()=>({useApp:()=>({member:state.member})}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:state.rows,loading:false,error:null,reload:vi.fn()})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),request:state.request}));
vi.mock('../components/ui',async original=>({...await original<typeof import('../components/ui')>(),Dialog:(await import('../components/ui/dialog')).Dialog,useToast:()=>state.toast}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host);vi.clearAllMocks();state.member={role:'technician'};vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();});
const button=(label:string)=>Array.from(document.querySelectorAll('button')).find(b=>b.textContent===label)!;
async function type(selector:string,value:string){const element=document.querySelector(selector) as HTMLInputElement|HTMLTextAreaElement;await act(async()=>{Object.getOwnPropertyDescriptor(element.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(element,value);element.dispatchEvent(new Event('input',{bubbles:true}));});}
it('technician records words with no amount input; failed save keeps text and retry key',async()=>{
 const reload=vi.fn();state.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
 await act(async()=>root.render(<PriceChangeCard base="/company" job={{id:'job',status:'in_progress'}} reload={reload}/>));
 await act(async()=>button('Price changed').click());await type('textarea','The fan motor needs replacing. I told him 900.');
 expect(document.querySelector('input')).toBeNull();
 await act(async()=>button('Save').click());expect(document.querySelector('textarea')?.value).toContain('I told him 900.');expect(document.querySelector('[role="alert"]')).not.toBeNull();
 await act(async()=>button('Save').click());expect(state.request.mock.calls[1][1].headers).toEqual(state.request.mock.calls[0][1].headers);
 expect(JSON.parse(state.request.mock.calls[0][1].body)).toEqual({words:'The fan motor needs replacing. I told him 900.'});expect(reload).toHaveBeenCalledOnce();
});
it('refused client remains held until technician separately confirms closing the visit',async()=>{
 state.request.mockResolvedValue({});
 await act(async()=>root.render(<PriceChangeCard base="/company" job={{id:'job',status:'scheduled',price_change:{state:'declined',words:'Tank leak',technician_name:'Ravi'}}} reload={vi.fn()}/>));
 expect(host.textContent).toContain('Client said no');expect(host.textContent).toContain('Work is on hold');
 await act(async()=>button('Client refused').click());await type('textarea','He does not want the repair.');await act(async()=>button('Close visit').click());
 expect(state.request.mock.calls[0][0]).toBe('/company/work-orders/job/client-refused');
});
it('client has approve and say no controls; office view has status with no price button',async()=>{
 const job={id:'job',status:'in_progress',scheduled_for:null,quote_status:'pending',quote_amount:850,updated_at:'2026-10-22T10:00:00.000Z'};
 state.request.mockResolvedValue({});
 await act(async()=>root.render(<QuoteVisit base="/company" o={job} client office={false} currency="AED" reload={vi.fn()} section="costs"/>));
 expect(button('Approve price')).toBeTruthy();await act(async()=>button('Say no').click());
 expect(JSON.parse(state.request.mock.calls[0][1].body)).toEqual({decision:'declined',amount:850,updated_at:job.updated_at});
 await act(async()=>root.render(<QuoteVisit base="/company" o={job} client={false} office={false} currency="AED" reload={vi.fn()} section="costs"/>));
 expect(button('Send a new price')).toBeUndefined();expect(button('Say no')).toBeUndefined();expect(host.textContent).toContain('Waiting for the client');
});
it('owner price form keeps typed price and note when sending fails',async()=>{
 state.request.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({});
 await act(async()=>root.render(<QuoteVisit base="/company" o={{id:'job',status:'scheduled',scheduled_for:null}} client={false} office currency="AED" reload={vi.fn()} section="costs"/>));
 await act(async()=>button('Send price').click());await type('input','950');await type('textarea','New tank');await act(async()=>button('Send').click());
 expect(document.querySelector('input')?.value).toBe('950');expect(document.querySelector('textarea')?.value).toBe('New tank');
 await act(async()=>button('Send').click());expect(state.request.mock.calls[1][1].headers).toEqual(state.request.mock.calls[0][1].headers);
});
it('waiting prices gives each held job a link and the refusal status',async()=>{
 state.rows=[{id:'job',order_number:3,title:'Water heater',price_change:{state:'declined',words:'New tank',technician_name:'Ravi'}}];
 await act(async()=>root.render(<WaitingPrices base="/company"/>));
 expect(host.textContent).toContain('Client said no');expect(host.querySelector('a')?.getAttribute('href')).toBe('/work-orders/job');
});

it('client can start a new linked request from a refused visit',async()=>{
 state.member={role:'client'};
 await act(async()=>root.render(<PriceChangeCard base="/company" job={{id:'old',site_id:'site',status:'cancelled',price_change:{state:'refused',words:'New motor',technician_name:'Ravi'}}} reload={vi.fn()}/>));
 expect(host.querySelector('a')?.getAttribute('href')).toBe('/work-orders/new?site=site&from=old');expect(button('Price changed')).toBeUndefined();
});
