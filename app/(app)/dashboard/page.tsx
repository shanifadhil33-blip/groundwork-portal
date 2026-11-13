import { OfficeHome } from '../../../components/app/office-home';
import { InitialResourceProvider } from '../../../components/app/initial-resources';
import { getAppPageData, initialResources } from '../../../lib/server-page-data';
import { homeSummary } from '../../../lib/services/home';
import { getDayPlan } from '../../../lib/services/day-plan';
import { listWorkOrders } from '../../../lib/services/work-orders';

export const metadata = { title: 'Home' };
const TODAY = 'today=true&sort=scheduled_for&dir=asc&pageSize=10';

/** Home for office roles. Its numbers arrive with the page, so the first paint is complete. */
export default async function Page() {
  const app = await getAppPageData(), member = app?.me.memberships[0];
  if (!app || !member || member.role === 'client' || member.role === 'technician') return <OfficeHome />;
  const ws = member.workspace_id, base = `/api/workspaces/${ws}`;
  const resources = await initialResources(app.user, [
    [`${base}/home`, () => homeSummary(app.user, ws)],
    [`${base}/day-plan`, () => getDayPlan(app.user, ws)],
    [`${base}/work-orders?${TODAY}`, () => listWorkOrders(app.user, ws, new URLSearchParams(TODAY))],
  ]);
  return <InitialResourceProvider resources={resources}><OfficeHome /></InitialResourceProvider>;
}
