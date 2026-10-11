import { ClientHome } from '../../../components/app/client-home';
import { InitialResourceProvider } from '../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../lib/server-page-data';
import { listWorkOrders } from '../../../lib/services/work-orders';
export default async function Page() {
  const app=await getAppPageData(),member=app?.me.memberships[0];
  if(!app||!member||member.role!=='client')return <ClientHome/>;
  const base=`/api/workspaces/${member.workspace_id}/work-orders`;
  const queries=['status=open&status=scheduled&status=in_progress&status=waiting_on_parts&sort=updated_at&dir=desc&pageSize=6','sort=updated_at&dir=desc&pageSize=5'];
  const resources=await initialResources(app.user,queries.map(query=>[`${base}?${query}`,()=>listWorkOrders(app.user,member.workspace_id,new URLSearchParams(query))] as const));
  return <InitialResourceProvider resources={resources}><ClientHome/></InitialResourceProvider>;
}
