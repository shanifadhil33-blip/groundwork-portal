'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bot, Building2, ChevronRight, UserRound, Users } from 'lucide-react';
import { Translated } from './app-words';
import { useApp } from './context';
import { AgentAccess } from './agent-access';
import { Audit } from './audit';
import { CompanyMemory } from './company-memory';
import { HomeAddress, ListingSettings } from './company-joining';
import { DataProtection } from './data-protection';
import { Documents } from './documents';
import { ChecklistSettings } from './job-checklists';
import { PersonalAgentLog, PersonalAgentSettings } from './personal-agent-settings';
import { PushSettings } from './push-settings';
import { AgentSettings, Appearance, CompanySettings, OwnerSettings, Profile } from './settings';
import { SettingsInvites } from './settings-invites';
import { VisitChargeSettings } from './visit-charge-settings';
import { PageHeader } from '../ui/layout';
import { Card } from '../ui';

export type SettingsGroup = 'you' | 'agent' | 'company' | 'team';
const GROUPS: { key: SettingsGroup; label: string; line: string; icon: typeof UserRound; staff: boolean }[] = [
  { key: 'you', label: 'You', line: 'Name, language, notifications and look.', icon: UserRound, staff: false },
  { key: 'agent', label: 'Agent', line: 'Its name, how it answers and what it remembers.', icon: Bot, staff: false },
  { key: 'company', label: 'Company', line: 'Details, visit prices, checklists and documents.', icon: Building2, staff: true },
  { key: 'team', label: 'Team and access', line: 'People, roles and invite links.', icon: Users, staff: true },
];

/** You and Agent for everyone; Company and Team and access for the owner and admin only. */
export function groupsFor(role?: string | null) {
  return GROUPS.filter(group => !group.staff || role === 'admin');
}

function Row({ href, label, line }: { href: string; label: string; line?: string }) {
  return <Link className="list-row" href={href}><span className="list-row-main"><span className="list-row-title">{label}</span>{line && <span className="list-row-meta">{line}</span>}</span><ChevronRight className="directional-icon" aria-hidden="true" /></Link>;
}

function YouGroup() {
  const { member } = useApp();
  return <>
    <Card><Profile /></Card>
    {member?.role === 'client' && member.client_kind === 'household' && <Card><HomeAddress base={`/api/workspaces/${member.workspace_id}`} /></Card>}
    <Card><PushSettings /></Card>
    <Card><Appearance /></Card>
    <Card><nav className="list" aria-label="You"><Row href="/settings/you/data" label="Your data" line="Download your records or ask to delete your account." /></nav></Card>
  </>;
}

function AgentGroup() {
  const { member, workspace } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, admin = member?.role === 'admin';
  const learns = admin || (member?.role === 'staff' && member.staff_kind !== 'office');
  return <>
    <Card><PersonalAgentSettings embedded /></Card>
    {admin && <Card><AgentSettings base={base} admin={admin} /></Card>}
    {learns && <Card><CompanyMemory embedded /></Card>}
    <Card><PersonalAgentLog embedded /></Card>
    {admin && !workspace?.is_demo && <Card><AgentAccess base={base} admin={admin} demo={false} /></Card>}
  </>;
}

function CompanyGroup() {
  const { member } = useApp(), base = `/api/workspaces/${member?.workspace_id}`;
  return <>
    <Card><CompanySettings base={base} admin /></Card>
    <Card><VisitChargeSettings base={base} /></Card>
    <Card><ChecklistSettings base={base} /></Card>
    <Card><nav className="list" aria-label="Company"><Row href="/settings/company/documents" label="Company documents" line="Licences, insurance and permits." /><Row href="/settings/company/history" label="Change history" line="See every change anyone made, newest first." /></nav></Card>
    <Card><details className="more-options"><summary>More options</summary><ListingSettings base={base} /></details></Card>
    {member?.is_owner && <Card><OwnerSettings base={base} /></Card>}
  </>;
}

function TeamGroup() {
  const { member, workspace } = useApp();
  return <>
    <Card><nav className="list" aria-label="Team"><Row href="/team" label="Team" line="Your people, what each one does and his days off." /></nav></Card>
    <Card><SettingsInvites base={`/api/workspaces/${member?.workspace_id}`} demo={!!workspace?.is_demo} /></Card>
  </>;
}

const CONTENT: Record<SettingsGroup, () => ReactNode> = { you: YouGroup, agent: AgentGroup, company: CompanyGroup, team: TeamGroup };

/** Settings. Phone: the list of groups, each opens its own page. Laptop: a side menu and one column. */
export function SettingsPage({ group }: { group?: SettingsGroup }) {
  const { member } = useApp();
  const groups = groupsFor(member?.role);
  const current = group && groups.some(g => g.key === group) ? group : null;
  const Content = CONTENT[current ?? 'you'];
  const title = current ? groups.find(g => g.key === current)!.label : 'Settings';
  return (
    <Translated>
      <div className={`page settings-page ${current ? 'has-group' : 'no-group'}`}>
        <PageHeader><div className="page-title"><h1>{title}</h1><p>{current ? groups.find(g => g.key === current)!.line : 'Your profile, your Agent and, for the owner, the company.'}</p></div></PageHeader>
        <div className="settings-layout">
          <nav className="settings-nav" aria-label="Settings">
            {current && <p className="settings-nav-title">Settings</p>}
            <ul className="list">
              {groups.map(g => (
                <li key={g.key}>
                  <Link className="list-row" href={`/settings/${g.key}`} aria-current={(current ?? 'you') === g.key ? 'page' : undefined}>
                    <g.icon aria-hidden="true" />
                    <span className="list-row-main"><span className="list-row-title">{g.label}</span><span className="list-row-meta">{g.line}</span></span>
                    <ChevronRight className="directional-icon" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="settings-content"><Content /></div>
        </div>
      </div>
    </Translated>
  );
}

/** Your data: download records or ask to delete the account. */
export function YourDataPage() {
  return <Translated><div className="page settings-sub"><PageHeader><div className="page-title"><h1>Your data</h1><p>Download your records or ask to delete your account.</p></div></PageHeader><Card><DataProtection /></Card></div></Translated>;
}

/** A Company sub page: documents or change history, inside Settings. */
export function CompanySubPage({ page }: { page: 'documents' | 'history' }) {
  const { member } = useApp();
  if (member?.role !== 'admin') return null;
  return page === 'documents' ? <Translated><div className="page"><Documents embedded /></div></Translated> : <Audit />;
}
