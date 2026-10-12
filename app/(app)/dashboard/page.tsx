import { Dashboard } from '../../../components/app/dashboard';
import { InitialResourceProvider } from '../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../lib/server-page-data';
import { cookies } from 'next/headers';
import { firstUseCookie } from '../../../lib/ui/first-use';
import { listClients } from '../../../lib/services/clients';
import { listImports } from '../../../lib/services/imports';
import { listMembers } from '../../../lib/services/members';
import { listInvites } from '../../../lib/services/invites';
import { listTokens } from '../../../lib/services/tokens';
export default async function Page() {
  const app=await getAppPageData(),member=app?.me.memberships[0];
  if(!app||!member||member.role==='client')return <Dashboard/>;
  const base=`/api/workspaces/${member.workspace_id}`,ws=member.workspace_id,admin=member.role==='admin';
  // Getting started checklist: shown for a new workspace until it's done or dismissed. When it shows, its data loads
  // here too, so it renders complete in the first paint instead of filling in.
  const counts=(app.resources[`${base}/dashboard`] as {data?:{by_status:Record<string,number>}}|undefined)?.data;
  const total=counts?Object.values(counts.by_status).reduce((a,b)=>a+b,0):0,state=(await cookies()).get(firstUseCookie(ws))?.value;
  const firstUse=state!=='dismissed'&&(state==='started'||!!app.workspace?.is_demo||(!!counts&&total===0));
  const resources=await initialResources(app.user,[
    ...(firstUse?[
      [`${base}/clients`,()=>listClients(app.user,ws)] as const,
      [`${base}/imports`,()=>listImports(app.user,ws)] as const,
      [`${base}/tokens${admin?'?all=true':''}`,()=>listTokens(app.user,ws,new URLSearchParams(admin?'all=true':''))] as const,
      ...(admin?[[`${base}/members`,()=>listMembers(app.user,ws)] as const,[`${base}/invites`,()=>listInvites(app.user,ws)] as const]:[]),
    ]:[]),
  ]);
  return <InitialResourceProvider resources={resources}><Dashboard firstUse={firstUse}/></InitialResourceProvider>;
}
