// @vitest-environment jsdom
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkOrderForm } from '../components/app/work-order-form';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkOrderCard } from '../components/app/work-order-card';
import type { WorkOrder } from '../lib/ui/work-orders';
import { ClientVisitActions } from '../components/app/client-visit-actions';
import { post, request } from '../lib/ui/api';
import { notificationMessage } from '../lib/ui/notifications';
const state=vi.hoisted(()=>({previous:null as {user_id:string;name:string}|null}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:vi.fn(),replace:vi.fn()})}));
vi.mock('../components/app/context',()=>({useApp:()=>({member:{role:'client',client_kind:'household',workspace_id:'demo',client_id:'client'},me:{user:{id:'faisal',name:'Faisal'}},workspace:{timezone:'Asia/Dubai'}})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string|null)=>({loading:false,error:null,data:url?.endsWith('/previous-technician')?state.previous:url?.endsWith('/request-sites')?[]:undefined,reload:vi.fn()})}));
vi.mock('../lib/ui/api',async original=>({...await original<typeof import('../lib/ui/api')>(),post:vi.fn(),request:vi.fn()}));
vi.mock('../components/ui',()=>({Button:({children,onClick,disabled}:any)=><button disabled={disabled} onClick={onClick}>{children}</button>,Card:({children}:any)=><div>{children}</div>,Badge:({children}:any)=><span>{children}</span>,StatusBadge:({children}:any)=><span>{children}</span>,DatePicker:()=>null,Dropdown:()=>null,Skeleton:()=>null,PageSkeleton:()=>null,EmptyState:()=>null,ErrorState:()=>null,useToast:()=>vi.fn()}));
(globalThis as any).React=React;(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;
let root:ReturnType<typeof createRoot>;
const slot=new Date(Date.UTC(2032,0,12,7)).toISOString(),version=new Date(Date.UTC(2032,0,1)).toISOString();
afterEach(()=>{act(()=>root?.unmount());document.body.innerHTML='';vi.resetAllMocks();state.previous=null;});
function mount(status='scheduled',on_way_at:string|null=null){const el=document.createElement('div');document.body.append(el);root=createRoot(el);const reload=vi.fn();act(()=>root.render(<ClientVisitActions base="/api/workspaces/demo" job={{id:'job',status,updated_at:version,on_way_at}} reload={reload}/>));return {el,reload};}
async function tap(el:HTMLElement,label:string){await act(async()=>{Array.from(el.querySelectorAll('button')).find(b=>b.textContent===label)!.click();});}
it('opens server slots, prepares a card on selection and confirms only on Yes',async()=>{
 vi.mocked(request).mockResolvedValue({slots:[slot],updated_at:version,timezone:'Asia/Dubai'});
 vi.mocked(post).mockResolvedValueOnce({pending_action:{id:'action',summary:'Move the visit to eleven?',why:'Nothing changes until you say yes.'}}).mockResolvedValueOnce({reply:'Your visit has moved.'});
 const {el,reload}=mount();await tap(el,'Reschedule');expect(request).toHaveBeenCalledWith('/api/workspaces/demo/work-orders/job/visit-change');expect(post).not.toHaveBeenCalled();
 const choice=Array.from(el.querySelectorAll('button')).find(b=>b.textContent?.includes('11:00'))!;await act(async()=>choice.click());expect(post).toHaveBeenCalledTimes(1);expect(post).toHaveBeenLastCalledWith('/api/workspaces/demo/work-orders/job/visit-change',{tool:'reschedule_visit',updated_at:version,scheduled_for:slot});expect(el.textContent).toContain('Move the visit to eleven?');expect(reload).not.toHaveBeenCalled();
 await tap(el,'Yes');expect(post).toHaveBeenLastCalledWith('/api/workspaces/demo/assistant',{messages:[],confirm_action_id:'action'});expect(reload).toHaveBeenCalledOnce();
});
it.each(['in_progress','waiting_on_parts','done','cancelled'])('hides Cancel for %s',status=>{expect(mount(status).el.textContent).not.toContain('Cancel');});
it('hides actions while on the way and offers only Cancel for an open request',()=>{
 const first=mount('scheduled',slot);expect(first.el.textContent).toBe('');act(()=>root.unmount());const next=mount('open');expect(next.el.textContent).toBe('Cancel');
});
it('shows a cancellation card and Change declines it without applying a change',async()=>{
 vi.mocked(post).mockResolvedValueOnce({pending_action:{id:'action',summary:'Cancel this job?',why:'Nothing changes until you say yes.'}}).mockResolvedValueOnce({declined:true});const {el,reload}=mount();await tap(el,'Cancel');expect(el.textContent).toContain('Cancel this job?');await tap(el,'Change');expect(post).toHaveBeenLastCalledWith('/api/workspaces/demo/assistant/log/action/decline',{});expect(reload).not.toHaveBeenCalled();expect(el.textContent).not.toContain('Yes');
});
it('makes cancellation and callback notices actionable in plain words',()=>{
 expect(notificationMessage({kind:'client_callback',actor_name:'Faisal',work_order_title:'Leaking tap'})).toContain('Please call him.');
 expect(notificationMessage({kind:'job_cancelled',actor_name:'Kevin',work_order_title:'Leaking tap'})).toContain('You do not need to go.');
});

it('shows the repeat technician checkbox on the request form only after a finished visit',()=>{
 expect(renderToStaticMarkup(<WorkOrderForm/>)).not.toContain('Ask for');
 state.previous={user_id:'ravi',name:'Ravi'};
 const html=renderToStaticMarkup(<WorkOrderForm/>);expect(html).toContain('type="checkbox"');expect(html).toContain('Ask for');expect(html).toContain('Ravi');expect(html).toContain('again');
});

const travelJob = { id:'job',order_number:1,title:'Repair tap',status:'scheduled',on_way_at:'2032-01-12T07:00:00Z',priority:'normal',due_on:null,assignee_id:null } as WorkOrder;
// NOTIF08 polish: the team also sees On the way once the technician has set off.
it('client and staff job cards show travel once the technician set off',()=>{
 const props={order:travelJob,clientName:'Home',assigneeName:'No technician yet',onOpen:()=>{}};
 expect(renderToStaticMarkup(<WorkOrderCard {...props} client/>)).toContain('On the way');
 expect(renderToStaticMarkup(<WorkOrderCard {...props} client={false}/>)).toContain('On the way');
 expect(renderToStaticMarkup(<WorkOrderCard {...props} order={{...travelJob,on_way_at:null}} client={false}/>)).toContain('Scheduled');
 expect(renderToStaticMarkup(<WorkOrderCard {...props} order={{...travelJob,on_way_at:null}} client/>)).toContain('Scheduled');
});
