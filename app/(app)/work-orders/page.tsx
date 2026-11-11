import { WorkOrderList } from '../../../components/app/work-order-list';
import { ToApprove } from '../../../components/app/to-approve';
import { InitialResourceProvider } from '../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../lib/server-page-data';
import { listWorkOrders } from '../../../lib/services/work-orders';
import { listClients } from '../../../lib/services/clients';
import { listMembers } from '../../../lib/services/members';
import { isOffice } from '../../../lib/roles';
import { activeByDefault } from '../../../lib/ui/work-orders';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const app=await getAppPageData(),member=app?.me.memberships[0];
  if((await searchParams).tab==='approve'&&member&&isOffice(member.role))return <ToApprove/>;
  if(!app||!member)return <WorkOrderList/>;
  const query=new URLSearchParams();
  // The tab word is for this page, not a filter for the list.
  for(const [key,value] of Object.entries(await searchParams))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);
  const base=`/api/workspaces/${member.workspace_id}`,api=new URLSearchParams(query);
  api.delete('page');api.delete('cursor');api.delete('tab');api.set('pageSize','100');activeByDefault(api,member.role);
  const resources=await initialResources(app.user,[
    [`${base}/work-orders?${api}`,()=>listWorkOrders(app.user,member.workspace_id,api,true)],
    ...(isOffice(member?.role)?[[`${base}/clients`,()=>listClients(app.user,member.workspace_id)] as const,[`${base}/members`,()=>listMembers(app.user,member.workspace_id)] as const]:[]),
  ]);
  return <InitialResourceProvider resources={resources}><WorkOrderList/></InitialResourceProvider>;
}
