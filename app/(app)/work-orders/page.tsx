import { WorkOrderList } from '../../../components/app/work-order-list';
import { InitialResourceProvider } from '../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../lib/server-page-data';
import { listWorkOrders } from '../../../lib/services/work-orders';
import { listClients } from '../../../lib/services/clients';
import { listMembers } from '../../../lib/services/members';
import { isOffice } from '../../../lib/roles';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  const app=await getAppPageData(),member=app?.me.memberships[0];
  if(!app||!member)return <WorkOrderList/>;
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams))for(const item of Array.isArray(value)?value:value===undefined?[]:[value])query.append(key,item);
  const base=`/api/workspaces/${member.workspace_id}`,api=new URLSearchParams(query);
  api.delete('page');api.delete('cursor');api.set('pageSize','100');
  const resources=await initialResources(app.user,[
    [`${base}/work-orders?${api}`,()=>listWorkOrders(app.user,member.workspace_id,api,true)],
    ...(isOffice(member?.role)?[[`${base}/clients`,()=>listClients(app.user,member.workspace_id)] as const,[`${base}/members`,()=>listMembers(app.user,member.workspace_id)] as const]:[]),
  ]);
  return <InitialResourceProvider resources={resources}><WorkOrderList/></InitialResourceProvider>;
}
