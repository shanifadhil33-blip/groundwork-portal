'use client';
import Link from 'next/link';
import { CalendarCheck, AlarmClock, ClipboardList, Phone } from 'lucide-react';
import { PageHeader } from '../ui/layout';
import { EmptyState, ErrorState, Skeleton } from '../ui';
import { roleLabels, type Role } from '../../lib/roles';
import { useApp } from './context';
import { useResource } from './resource';
import { AddFieldWorker, NewLinkButton } from './field-workers';
import { NoAccess } from './no-access';

type TeamPerson = { user_id: string; role: Role; name: string | null; email: string | null; phone: string | null; open: number; today: number; late: number; signs_in_with: 'google' | 'code' };

/** One person: name, role, and three big numbers that open their jobs. */
function PersonCard({ p, base, canLink }: { p: TeamPerson; base: string; canLink: boolean }) {
  const jobs = (q: string) => `/work-orders?assignee_id=${p.user_id}${q}`;
  const nums = [
    { label: 'Today', value: p.today, icon: CalendarCheck, href: jobs('&today=true') },
    { label: 'Late', value: p.late, icon: AlarmClock, href: jobs('&overdue=true'), tone: p.late ? 'danger' : '' },
    { label: 'Open', value: p.open, icon: ClipboardList, href: jobs('&active=true') },
  ];
  return <li className="person-card">
    <div className="heading-row"><div><strong>{p.name ?? 'Team member'}</strong><p className="small muted">{roleLabels[p.role] ?? p.role}</p></div>
      {p.phone && <a className="button secondary" href={`tel:${p.phone.replace(/[^+0-9]/g, '')}`} aria-label={`Call ${p.name ?? 'them'}`}><Phone size={16} aria-hidden="true" />Call</a>}</div>
    <div className="person-nums">{nums.map(n => <Link key={n.label} href={n.href} className={`person-num ${n.tone ? `tile-${n.tone}` : ''}`} aria-label={`${n.value} ${n.label} for ${p.name ?? 'them'}`}><n.icon size={18} aria-hidden="true" /><strong>{n.value}</strong><span>{n.label}</span></Link>)}</div>
    {canLink && p.signs_in_with === 'code' && <NewLinkButton base={base} userId={p.user_id} name={p.name ?? 'them'} phone={p.phone} />}
  </li>;
}

export function Team() {
  const { me, member, workspace } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, office = member?.role === 'admin' || member?.role === 'staff';
  const team = useResource<TeamPerson[]>(office ? `${base}/team` : null);
  if (member && !office) return <NoAccess />;
  const others = (team.data ?? []).filter(p => p.user_id !== me.user.id), demo = !!workspace?.is_demo;
  return <div className="page stack team-page">
    <PageHeader><div><h1>Team</h1><p>Who works today, and what each person has to do.</p></div>
      {!demo && <AddFieldWorker base={base} admin={member?.role === 'admin'} demo={demo} onDone={() => void team.reload()} />}</PageHeader>
    {demo && <p className="small muted">The demo team is view only.</p>}
    {team.loading ? <Skeleton className="skeleton-card" /> : team.error ? <ErrorState retry={team.reload} /> :
      others.length ? <ul className="person-list">{(team.data ?? []).map(p => <PersonCard key={p.user_id} p={p} base={base} canLink={!demo} />)}</ul> :
      <EmptyState title="Add your first worker">Add a name and phone. We give you a code to send on WhatsApp. They sign in with it. No email needed.</EmptyState>}
    {member?.role === 'admin' && !demo && <p className="small"><Link href="/settings?tab=members">Change roles or invite by email</Link></p>}
  </div>;
}
