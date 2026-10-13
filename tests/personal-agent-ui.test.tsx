// @vitest-environment jsdom
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {Assistant} from '../components/app/assistant';
import {personalAgentChatKey} from '../lib/ui/personal-agent';
const state=vi.hoisted(()=>({user:'Ravi'}));
vi.mock('../components/app/context',async original=>({...await original<typeof import('../components/app/context')>(),useApp:()=>({member:{role:state.user==='Ravi'?'technician':'admin'},me:{user:{id:state.user}}})}));
vi.mock('../components/app/resource',()=>({useResource:()=>({data:{agent_name:null,language:'en-IN',voice_enabled:false},loading:false,error:null,reload:vi.fn()})}));
it('switching to admin never restores technician chat from the same workspace',async()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));Element.prototype.scrollIntoView=vi.fn();
 sessionStorage.clear();sessionStorage.setItem(personalAgentChatKey('Ravi','workspace'),JSON.stringify([{role:'user',content:'Ravi private chat'}]));sessionStorage.setItem('groundwork-assistant:workspace',JSON.stringify([{role:'user',content:'Old shared chat'}]));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(<Assistant key={state.user} ws="workspace" docked open={false} onClose={()=>{}}/>));expect(host.textContent).toContain('Ravi private chat');expect(host.textContent).not.toContain('Old shared chat');
 state.user='Imran';await act(async()=>root.render(<Assistant key={state.user} ws="workspace" docked open={false} onClose={()=>{}}/>));expect(host.textContent).not.toContain('Ravi private chat');expect(sessionStorage.getItem(personalAgentChatKey('Imran','workspace'))).toBe('[]');
 }finally{await act(async()=>root.unmount());host.remove();sessionStorage.clear();vi.unstubAllGlobals();}
});
