import { Dashboard } from '../../../components/app/dashboard';
import { InitialResourceProvider } from '../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../lib/server-page-data';
import { listAudit } from '../../../lib/services/audit';
import { syncRuns } from '../../../lib/services/supplier';
export default async function Page() {
  const app=await getAppPageData(),member=app?.me.memberships[0];
  if(!app||!member||member.role==='client')return <Dashboard/>;
  const base=`/api/workspaces/${member.workspace_id}`;
  const resources=await initialResources(app.user,[
    [`${base}/audit?pageSize=6`,()=>listAudit(app.user,member.workspace_id,new URLSearchParams('pageSize=6'))],
    ...(app.workspace?.is_demo?[[`${base}/supplier/sync-runs`,()=>syncRuns(app.user,member.workspace_id)] as const]:[]),
  ]);
  return <InitialResourceProvider resources={resources}><Dashboard/></InitialResourceProvider>;
}
