import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { requireUser } from './auth';
import { withUser } from './db';
import { ApiError } from './http';
import { me, getWorkspace, dashboard } from './services/workspaces';
import { unreadCount } from './services/notifications';
import { getPreferences } from './services/settings';
import type { Me, Workspace } from '../components/app/context';
import type { InitialResources } from '../components/app/initial-resources';
export type AppPageData = {user:string;me:Me;workspace:Workspace|null;resources:InitialResources};
// React cache deduplicates layout/page reads only within this request, never across users.
export const getAppPageData=cache(async ():Promise<AppPageData|null>=>{
  try {
    const user=await requireUser(new Request('http://portal.internal',{headers:await headers()}));
    return await withUser(user,async()=>{
      const identity=await me(user);const selected=(await headers()).get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith('groundwork-workspace='))?.slice(21);identity.memberships.sort((a,b)=>Number(b.workspace_id===selected)-Number(a.workspace_id===selected));const member=identity.memberships[0];
      const workspace=member?await getWorkspace(user,member.workspace_id):null;
      const resources=await initialResources(user,[
        // Match the table defaults without inserting a row during a page render.
        ['/api/me/preferences',async()=>await getPreferences(user,false)??{language:null,theme:'system',email_notifications:true,timezone:null,voice_enabled:true,agent_name:null,agent_avatar:null,preferred_name:null,name_asked_at:null}],
        ['/api/notifications/unread-count',()=>unreadCount(user)],
        ...(member?[[`/api/workspaces/${member.workspace_id}/dashboard`,()=>dashboard(user,member.workspace_id)] as const]:[]),
      ]);
      return {user,me:identity as Me,workspace:workspace?{id:workspace.id,name:workspace.name,is_demo:workspace.is_demo,timezone:workspace.timezone,country:workspace.country,region:workspace.region,currency:workspace.currency,approval_mode:workspace.approval_mode,role_names:workspace.role_names??{},company_size:workspace.company_size,enabled_roles:workspace.enabled_roles,enabled_dashboards:workspace.enabled_dashboards}:null,resources};
    });
  } catch {
    // Keep the existing client recovery/sign-in flow when session or DB reads fail.
    return null;
  }
});
export async function initialResources(user:string,tasks:readonly (readonly [string,()=>Promise<unknown>])[]):Promise<InitialResources> {
  return withUser(user,async()=>{
    const results=await Promise.allSettled(tasks.map(async([url,load])=>[url,JSON.parse(JSON.stringify(await load()))] as const));
    const resources:InitialResources={};
    results.forEach((result,index)=>{
      if(result.status==='fulfilled')resources[result.value[0]]={data:result.value[1]};
      else if(result.reason instanceof ApiError)resources[tasks[index][0]]={error:{status:result.reason.status,message:result.reason.message,code:result.reason.code,fields:result.reason.fields}};
    });
    return resources;
  });
}
