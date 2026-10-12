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
import { useState } from 'react';
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

type TeamPerson = { trades: string[]; areas: string[]; user_id: string; role: Role; name: string | null; email: string | null; phone: string | null; open: number; today: number; late: number; done_month: number; done_total: number; off_days: number[]; signs_in_with: 'google' | 'code' };

/** One person: name, role, and three big numbers that open their jobs. */
function PersonCard({ p, base, canLink, canEdit, areas, onDone }: { p: TeamPerson; base: string; canLink: boolean; canEdit: boolean; areas: string[]; onDone: () => void }) {
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
    {(p.trades.length > 0 || p.areas.length > 0) && <div className="skill-chips">{p.trades.map(t => <span key={t} className="chip">{tradeLabels[t as Trade] ?? t}</span>)}{p.areas.map(a => <span key={a} className="chip chip-area">{a}</span>)}</div>}
    {p.role !== 'admin' && <p className="small muted person-record">Jobs done: {p.done_month} this month, {p.done_total} in total{p.off_days?.length ? ` · Off every ${p.off_days.map(d => DAYS[d]).join(', ')}` : ''}</p>}
    {(canEdit || canLink) && <div className="row">{canEdit && p.role !== 'admin' && <><SkillsButton p={p} base={base} areas={areas} onDone={onDone} /><OffDaysButton p={p} base={base} onDone={onDone} /></>}{canLink && p.signs_in_with === 'code' && <NewLinkButton base={base} userId={p.user_id} name={p.name ?? 'them'} phone={p.phone} />}</div>}
  </li>;
}

export function Team() {
  const { me, member, workspace } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, office = member?.role === 'admin' || member?.role === 'staff';
  const team = useResource<TeamPerson[]>(office ? `${base}/team` : null), areas = useResource<string[]>(office ? `${base}/areas` : null);
  if (member && !office) return <NoAccess />;
  const others = (team.data ?? []).filter(p => p.user_id !== me.user.id), demo = !!workspace?.is_demo;
  return <div className="page stack team-page">
    <PageHeader><div><h1>Team</h1><p>Who works today, and what each person has to do.</p></div>
      {!demo && <AddFieldWorker base={base} admin={member?.role === 'admin'} demo={demo} onDone={() => void team.reload()} />}</PageHeader>
    {demo && <p className="small muted">In the demo you cannot add new people. Everything else works.</p>}
    {team.loading ? <Skeleton className="skeleton-card" /> : team.error ? <ErrorState retry={team.reload} /> :
      others.length ? <ul className="person-list">{(team.data ?? []).map(p => <PersonCard key={p.user_id} p={p} base={base} canLink={!demo} canEdit={office} areas={areas.data ?? []} onDone={() => void team.reload()} />)}</ul> :
      <EmptyState title="Add your first worker">Add a name and phone. We give you a code to send on WhatsApp. They sign in with it. No email needed.</EmptyState>}
    {office && others.length > 0 && <LeaveCalendar base={base} people={team.data ?? []} />}
    {member?.role === 'admin' && !demo && <p className="small"><Link href="/settings?tab=members">Change roles or invite by email</Link></p>}
  </div>;
}
