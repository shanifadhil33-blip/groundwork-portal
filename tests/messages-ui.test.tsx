// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {ThreadMessages} from '../components/app/messages';
vi.mock('../components/app/context',async original=>({...await original<typeof import('../components/app/context')>(),useApp:()=>({member:{role:'client',workspace_id:'workspace'},me:{user:{id:'reader'}}})}));
vi.mock('../components/app/resource',()=>({useResource:(url:string)=>({data:url?.includes('messages?')?{data:[{id:'message',sender_id:'sender',sender_name:'Ravi',body:'നാളെ',original_body:'Tomorrow',translated:true,created_at:'2026-10-13T12:00:00Z',photo_ids:[]}],language:'ml',last_message_at:'2026-10-13T12:00:00Z'}:{language:'en-IN',voice_enabled:false},loading:false,error:null,reload:vi.fn()})}));
vi.mock('../lib/ui/api',()=>({post:vi.fn().mockResolvedValue({read:true}),request:vi.fn().mockResolvedValue({})}));
it('shows translated content and lets the reader show the original',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<ThreadMessages thread={{conversation_id:'thread'}}/>));expect(host.textContent).toContain('Ravi');expect(host.textContent).toContain('നാളെ');
 const show=[...host.querySelectorAll('button')].find(b=>b.textContent==='Show original')!;await act(async()=>show.click());expect(host.textContent).toContain('Tomorrow');expect(host.textContent).toContain('Show translation');
 }finally{await act(async()=>root.unmount());host.remove();vi.unstubAllGlobals();}
});
