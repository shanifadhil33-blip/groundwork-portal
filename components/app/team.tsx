'use client';
import { ContactName } from './contact-name';
import Link from 'next/link';
import { CalendarCheck, AlarmClock, ClipboardList, Phone } from 'lucide-react';
import { PageHeader } from '../ui/layout';
import { EmptyState, ErrorState, Skeleton } from '../ui';
import { doesJobs, roleHints, labelsFor, rolesLabel, type Role } from '../../lib/roles';
import { RequestError } from '../../lib/ui/api';
import { useApp } from './context';
import { useResource } from './resource';
import { AddFieldWorker, NewLinkButton } from './field-workers';
import { NoAccess } from './no-access';
import { useState } from 'react';
import { MemberMenu, ArchivedMembers } from './member-menu';
import { Button, Dialog } from '../ui';
import { request } from '../../lib/ui/api';
import { TRADES, tradeLabels, type Trade } from '../../lib/trades';
import { DAYS, LeaveCalendar, OffDaysButton } from './time-off';

/** Pick what a worker does and where. Tap to turn each one on or off. */
function SkillsButton({ p, base, areas, onDone }: { p: TeamPerson; base: string; areas: string[]; onDone: () => void }) {
  const [open, setOpen] = useState(false), [trades, setTrades] = useState<string[]>(p.trades), [mine, setMine] = useState<string[]>(p.areas), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const flip = (list: string[], v: string) => list.includes(v) ? list.filter(x => x !== v) : [...list, v];
  async function save() { setBusy(true); setError(''); try { await request(`${base}/members/${p.user_id}/skills`, { method: 'PUT', body: JSON.stringify({ trades, areas: mine }) }); setOpen(false); onDone(); } catch { setError('We could not save. Try again.'); } finally { setBusy(false); } }
  const pick = (all: string[], on: string[], set: (v: string[]) => void, label: (v: string) => string) => <div className="skill-chips">{all.map(v => <button key={v} type="button" className={`chip ${on.includes(v) ? 'chip-on' : ''}`} aria-pressed={on.includes(v)} disabled={busy} onClick={() => set(flip(on, v))}>{label(v)}</button>)}</div>;
  return <><Button variant="secondary" onClick={() => { setTrades(p.trades); setMine(p.areas); setOpen(true); }}>Trade and area</Button>
    <Dialog open={open} onClose={() => setOpen(false)} busy={busy} title={`What ${p.name ?? 'they'} can do`} footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="stack"><span className="field-label">Trade</span>{pick([...TRADES], trades, setTrades, v => tradeLabels[v as Trade])}
        <span className="field-label">Area</span>{areas.length ? pick(areas, mine, setMine, v => v) : <p className="small muted">Add an area to your sites first.</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog></>;
}

type TeamPerson = { extra_roles?: string[]; staff_kind?: string | null; trades: string[]; areas: string[]; user_id: string; role: Role; name: string | null; email: string | null; phone: string | null; open: number; today: number; late: number; done_month: number; done_total: number; off_days: number[]; signs_in_with: 'google' | 'code' };

/** Turn each role on or off. A person can hold several; they can do everything any of them allows. */
export function RolesButton({ p, base, onDone }: { p: { user_id: string; name: string | null; role: string; extra_roles?: string[]; staff_kind?: string | null; is_owner?: boolean; is_manager?: boolean }; base: string; onDone: () => void }) {
  const roleLabels = labelsFor(useApp().workspace?.role_names);
  const now = (p as any).is_owner ? ['owner',...(p.extra_roles??[])] : (p as any).is_manager ? ['manager',...(p.extra_roles??[])] : p.staff_kind === 'office' ? ['office', ...(p.extra_roles ?? [])] : [p.role, ...(p.extra_roles ?? [])], [open, setOpen] = useState(false), [on, setOn] = useState<string[]>(now), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() { setBusy(true); setError(''); try { await request(`${base}/members/${p.user_id}/roles`, { method: 'PUT', body: JSON.stringify({ roles: on }) }); setOpen(false); onDone(); } catch (e) { setError(e instanceof RequestError ? e.message : 'We could not save. Try again.'); } finally { setBusy(false); } }
  const enabled=useApp().workspace?.enabled_roles;
  const roles = (['owner','manager','admin', 'staff', 'office', 'technician'] as const).filter(r=>!enabled||enabled.includes(r));
  const label = (r: string) => r === 'owner'?'Owner':r === 'manager'?'Manager':r === 'office' ? 'Office staff' : roleLabels[r as 'admin'];
  const hint = (r: string) => r === 'owner'?'Runs the company and can choose its roles.':r === 'manager'?'Plans all jobs and manages the team.':r === 'office' ? 'Takes calls, makes and follows jobs, clients and sites. Does not run the team.' : roleHints[r as 'admin'];
  return <><Button variant="secondary" onClick={() => { setOn(now); setError(''); setOpen(true); }}>Roles</Button>
    <Dialog open={open} onClose={() => setOpen(false)} busy={busy} title={`What ${p.name ?? 'they'} does`} footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} disabled={!on.length} onClick={save}>Save</Button></>}>
      <div className="stack"><p className="small">Turn on everything this person does. In a small company one person can do it all.</p>
        <div className="role-toggles">{roles.map(r => <button key={r} type="button" className={`role-toggle ${on.includes(r) ? 'on' : ''}`} aria-pressed={on.includes(r)} disabled={busy} onClick={() => setOn(on.includes(r) ? on.filter(x => x !== r) : [...on, r])}><strong>{label(r)}</strong><span className="small">{hint(r)}</span></button>)}</div>
        {!on.length && <p className="small inline-error">Keep at least one.</p>}
        {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog></>;
}

/** One person: name, role, and three big numbers that open their jobs. */
function PersonCard({ p, base, canLink, canEdit, canRoles, areas, onDone, self }: { p: TeamPerson; base: string; canLink: boolean; canEdit: boolean; canRoles: boolean; areas: string[]; onDone: () => void; self?: boolean }) {
  const roleLabels = labelsFor(useApp().workspace?.role_names);
  const worker = p.role !== 'admin' || doesJobs(p);
  const jobs = (q: string) => `/work-orders?assignee_id=${p.user_id}${q}`;
  const nums = [
    { label: 'Today', value: p.today, icon: CalendarCheck, href: jobs('&today=true') },
    { label: 'Late', value: p.late, icon: AlarmClock, href: jobs('&overdue=true'), tone: p.late ? 'danger' : '' },
    { label: 'Open', value: p.open, icon: ClipboardList, href: jobs('&active=true') },
  ];
  return <li className="person-card">
    <div className="heading-row"><div><strong data-no-translate><ContactName name={p.name} userId={p.user_id}/></strong><p className="small muted">{rolesLabel(p, roleLabels)}</p></div>
      <div className="person-head-actions">
      {p.phone && <a className="button secondary" href={`tel:${p.phone.replace(/[^+0-9]/g, '')}`} aria-label={`Call ${p.name ?? 'them'}`}><Phone size={16} aria-hidden="true" />Call</a>}{canRoles && !self && <MemberMenu person={p} base={base} onChanged={onDone} />}</div></div>
    <nav className="person-job-links" aria-label="Worker jobs">{nums.map(n => <Link key={n.label} href={n.href} aria-label={`${n.value} ${n.label} for ${p.name ?? 'them'}`}>{n.label} {n.value}</Link>)}</nav>
    {(p.trades.length > 0 || p.areas.length > 0) && <div className="skill-chips">{p.trades.map(t => <span key={t} className="chip">{tradeLabels[t as Trade] ?? t}</span>)}{p.areas.map(a => <span key={a} className="chip chip-area">{a}</span>)}</div>}
    {worker && <p className="small muted person-record">Jobs done: {p.done_month} this month, {p.done_total} in total{p.off_days?.length ? ` · Off every ${p.off_days.map(d => DAYS[d]).join(', ')}` : ''}</p>}
    {(canEdit || canLink || canRoles) && <div className="row">{canRoles && <RolesButton p={p} base={base} onDone={onDone} />}{canEdit && worker && <><SkillsButton p={p} base={base} areas={areas} onDone={onDone} /><OffDaysButton p={p} base={base} onDone={onDone} /></>}{canLink && p.signs_in_with === 'code' && <NewLinkButton base={base} userId={p.user_id} name={p.name ?? 'them'} phone={p.phone} />}</div>}
  </li>;
}

export function Team() {
  const { me, member, workspace, reload } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, office = member?.role === 'admin' || member?.role === 'staff';
  const team = useResource<TeamPerson[]>(office ? `${base}/team` : null), areas = useResource<string[]>(office ? `${base}/areas` : null);
  if (member && !office) return <NoAccess />;
  const others = (team.data ?? []).filter(p => p.user_id !== me.user.id), demo = !!workspace?.is_demo;
  return <div className="page stack team-page">
    <PageHeader><div><h1>Team</h1></div>
      {!demo && <AddFieldWorker base={base} admin={member?.role === 'admin'} demo={demo} onDone={() => void team.reload()} />}</PageHeader>
    {demo && <p className="small muted">In the demo you cannot add new people. Everything else works.</p>}
    {team.loading ? <Skeleton className="skeleton-card" /> : team.error ? <ErrorState retry={team.reload} /> :
      others.length ? <ul className="person-list">{(team.data ?? []).map(p => <PersonCard key={p.user_id} p={p} base={base} canLink={!demo&&member?.staff_kind!=='office'} canEdit={office&&member?.staff_kind!=='office'} canRoles={member?.role === 'admin'} areas={areas.data ?? []} self={p.user_id === me.user.id} onDone={() => { void team.reload(); if (p.user_id === me.user.id) reload(); }} />)}</ul> :
      <EmptyState title="Add your first worker">Add a name and phone. We give you a code to send on WhatsApp. They sign in with it. No email needed.</EmptyState>}
    {office && others.length > 0 && <LeaveCalendar base={base} people={team.data ?? []} readOnly={member?.staff_kind==='office'} />}
    {member?.role === 'admin' && <ArchivedMembers key={(team.data ?? []).length} base={base} onChanged={() => void team.reload()} />}
    {member?.role === 'admin' && !demo && <p className="small"><Link href="/settings?tab=members">Change roles or invite by email</Link></p>}
  </div>;
}
