import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { requireUser } from './auth';
import { withUser } from './db';
import { ApiError } from './http';
import { me, getWorkspace, dashboard } from './services/workspaces';
import { unreadCount } from './services/notifications';
import type { Me, Workspace } from '../components/app/context';
import type { InitialResources } from '../components/app/initial-resources';
export type AppPageData = {user:string;me:Me;workspace:Workspace|null;resources:InitialResources};
// React cache deduplicates layout/page reads only within this request, never across users.
export const getAppPageData=cache(async ():Promise<AppPageData|null>=>{
  try {
    const user=await requireUser(new Request('http://portal.internal',{headers:await headers()}));
    return await withUser(user,async()=>{
      const identity=await me(user),member=identity.memberships[0];
      const workspace=member?await getWorkspace(user,member.workspace_id):null;
      const resources=await initialResources(user,[
        ['/api/notifications/unread-count',()=>unreadCount(user)],
        ...(member?[[`/api/workspaces/${member.workspace_id}/dashboard`,()=>dashboard(user,member.workspace_id)] as const]:[]),
      ]);
      return {user,me:identity as Me,workspace:workspace?{id:workspace.id,name:workspace.name,is_demo:workspace.is_demo,timezone:workspace.timezone,country:workspace.country,region:workspace.region,currency:workspace.currency}:null,resources};
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
