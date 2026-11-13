import { notFound } from 'next/navigation';
import { SettingsPage, type SettingsGroup } from '../../../../components/app/settings-groups';

const GROUPS = ['you', 'agent', 'company', 'team'];
export default async function Page({ params }: { params: Promise<{ group: string }> }) {
  const { group } = await params;
  if (!GROUPS.includes(group)) notFound();
  return <SettingsPage group={group as SettingsGroup} />;
}
