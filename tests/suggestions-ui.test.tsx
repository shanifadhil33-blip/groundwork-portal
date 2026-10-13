// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SuggestedJobs} from '../components/app/suggestions';
const state=vi.hoisted(()=>({office:false}));
vi.mock('../components/app/context',async original=>({...await original<typeof import('../components/app/context')>(),useApp:()=>({member:{role:'staff',staff_kind:state.office?'office':null,workspace_id:'workspace'},workspace:{is_demo:false}})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string)=>({data:url?.endsWith('/suggestions')?{data:[
 {id:'pending',title:'Tap leaks',sender_name:'Ravi',source:'technician',status:'pending',created_at:'2026-10-13T12:00:00Z',problem:'Leaking tap',photo_ids:[]},
 {id:'approved',title:'Valve replacement',sender_name:'Sam',source:'agent',status:'approved',work_order_id:'job',created_at:'2026-10-13T12:00:00Z',problem:'Worn valve',photo_ids:[]},
 {id:'declined',title:'New fitting',sender_name:'Ravi',source:'technician',status:'declined',decline_reason:'Please confirm the site',created_at:'2026-10-13T12:00:00Z',problem:'Loose fitting',photo_ids:[]},
 ],pending_count:1}:[],loading:false,error:null,reload:vi.fn()})}));
it('review keeps decision history and gives office staff no decision controls',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<SuggestedJobs/>));expect(host.textContent).toContain('Accepted');expect(host.textContent).toContain('Not accepted');expect(host.textContent).toContain('Please confirm the site');expect(host.querySelector('a[href="/work-orders/job"]')).toBeTruthy();expect([...host.querySelectorAll('button')].filter(b=>b.textContent==='Approve')).toHaveLength(1);
 state.office=true;await act(async()=>root.render(<SuggestedJobs/>));expect([...host.querySelectorAll('button')].some(b=>['Approve','Edit then approve','Decline'].includes(b.textContent??''))).toBe(false);
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
