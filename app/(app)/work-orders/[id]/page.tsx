import { WorkOrderDetail } from '../../../../components/app/work-order-detail';
import { InitialResourceProvider } from '../../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../../lib/server-page-data';
import { getWorkOrder } from '../../../../lib/services/work-orders';
import { listMembers } from '../../../../lib/services/members';
import { listOrders } from '../../../../lib/services/supplier';
export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params,app=await getAppPageData(),member=app?.me.memberships[0];
  if(!app||!member)return <WorkOrderDetail id={id}/>;
  const base=`/api/workspaces/${member.workspace_id}`;
  const resources=await initialResources(app.user,[
    [`${base}/work-orders/${id}`,()=>getWorkOrder(app.user,member.workspace_id,id)],
    ...(member.role!=='client'?[[`${base}/members`,()=>listMembers(app.user,member.workspace_id)] as const]:[]),
    ...(member.role!=='client'&&app.workspace?.is_demo?[[`${base}/supplier/orders`,()=>listOrders(app.user,member.workspace_id)] as const]:[]),
  ]);
  return <InitialResourceProvider resources={resources}><WorkOrderDetail id={id}/></InitialResourceProvider>;
}
