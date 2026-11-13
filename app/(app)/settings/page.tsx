import { redirect } from 'next/navigation';
import { SettingsPage } from '../../../components/app/settings-groups';

export const metadata = { title: 'Settings' };
/** Old ?tab= links land on the group that holds that setting now. */
const OLD_TABS: Record<string, string> = { profile: '/settings/you', notifications: '/settings/you', appearance: '/settings/you', privacy: '/settings/you', help: '/help', company: '/settings/company', workspace: '/settings/company', checklists: '/settings/company', history: '/settings/company/history', members: '/settings/team', 'agent-access': '/settings/agent' };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tab = (await searchParams).tab;
  if (typeof tab === 'string' && OLD_TABS[tab]) redirect(OLD_TABS[tab]);
  return <SettingsPage />;
}
