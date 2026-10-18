'use client';
import { ContactName } from './contact-name';
import { useUiLang } from './use-ui-lang';
import { formatInLang } from '../../lib/date-lang';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarClock } from 'lucide-react';
import { PageHeader } from '../ui/layout';
import { Badge, Button, Dialog, Dropdown, EmptyState, ErrorState, Skeleton, useToast } from '../ui';
import { DatePicker } from '../ui/lazy-date-picker';
import { request, RequestError } from '../../lib/ui/api';
import { localDate, scheduledInstant } from '../../lib/dates';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';

type Job = { heat_warning?: string|null; preferred_window?:string|null; id: string; order_number: number; title: string; status: string; priority: string; trade: string | null; assignee_id: string | null; scheduled_for: string | null; due_on: string | null; updated_at: string; site_name: string; area: string | null; day?: string; hour?: number };
type Person = { user_id: string; role: string; name: string | null };
type Board = { timezone: string; from: string; days: number; people: Person[]; jobs: Job[]; unscheduled: Job[]; away?: { user_id: string; kind: string; starts_on: string; ends_on: string }[] };

/** Monday of the week that holds this day (YYYY-MM-DD, no time zone games). */
export function weekStart(day: string) { const d = new Date(day + 'T12:00:00Z'); const back = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - back); return d.toISOString().slice(0, 10); }
export function addDays(day: string, n: number) { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
const dayName = (day: string, long = false, lang = 'en') => formatInLang(new Date(day + 'T12:00:00Z'), { weekday: long ? 'long' : 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }, lang);
export const part = (day: string, o: Intl.DateTimeFormatOptions, lang = 'en') => formatInLang(new Date(day + 'T12:00:00Z'), { ...o, timeZone: 'UTC' }, lang);
const hourLabel = (h: number) => new Intl.DateTimeFormat('en', { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 0, 1, h)));
const HOURS = Array.from({ length: 15 }, (_, i) => i + 6);

function Chip({ j, onOpen }: { j: Job; onOpen: (j: Job) => void }) {
  return <button type="button" className={`sched-job ${j.status === 'done' ? 'sched-done' : ''}`} onClick={() => onOpen(j)} aria-label={`Move ${j.title}`}>
    {j.hour != null && <span className="sched-time">{hourLabel(j.hour)}</span>}<strong data-no-translate>{j.title}</strong><span className="small muted">{[j.site_name, j.area].filter(Boolean).join(' · ')}</span>{j.heat_warning&&<span className="heat-note">Midday heat: move this</span>}
    {j.status === 'done' && <Badge>Done</Badge>}{j.priority === 'urgent' && <Badge tone="danger">Urgent</Badge>}</button>;
}

/** One sheet to move a job: day, hour, person. Done jobs only open. */
function MoveSheet({ j, base, tz, people, onClose, onSaved }: { j: Job; base: string; tz: string; people: Person[]; onClose: () => void; onSaved: () => void }) {
  const officeStaff = useApp().member?.staff_kind === 'office';
  const [day, setDay] = useState(j.day ?? localDate(Date.now(), tz)), [hour, setHour] = useState(String(j.hour ?? 9)), [who, setWho] = useState(j.assignee_id ?? ''), [busy, setBusy] = useState(false), [error, setError] = useState(''), toast = useToast();
  const done = j.status === 'done';
  async function save() {
    setBusy(true); setError('');
    try { await request(`${base}/work-orders/${j.id}`, { method: 'PATCH', body: JSON.stringify({ scheduled_for: scheduledInstant(day, tz, Number(hour)), assignee_id: who || null, updated_at: j.updated_at }) }); toast('Moved.'); onSaved(); }
    catch (e) { setError(e instanceof RequestError && e.status === 409 ? 'This job changed. Close and open it again.' : e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  }
  return <Dialog open onClose={onClose} busy={busy} title={done ? 'Done job' : 'Move job'} footer={done ? <Link className="button secondary" href={`/work-orders/${j.id}`}>Open job</Link> : <><Link className="button secondary" href={`/work-orders/${j.id}`}>Open job</Link><Button busy={busy} onClick={() => void save()}>Save</Button></>}>
    <div className="stack"><strong data-no-translate>{j.title}</strong><span className="small muted">{j.site_name}</span>
      {j.preferred_window&&<p>Best time for the visit: <span data-no-translate>{j.preferred_window}</span></p>}{!done && <><div className="form-field"><span className="field-label">Day</span><DatePicker label="Day" value={day} onChange={v => v && setDay(v)} disabled={busy} /></div>
        <div className="form-field"><span className="field-label">Time</span><Dropdown label="Time" value={hour} disabled={busy} options={HOURS.map(h => ({ value: String(h), label: hourLabel(h) }))} onChange={setHour} /></div>
        {!officeStaff && <div className="form-field"><span className="field-label">Person</span><Dropdown label="Person" value={who} disabled={busy} options={[{ value: '', label: 'Nobody yet' }, ...people.map(p => ({ value: p.user_id, label: p.name ?? 'Team member' }))]} onChange={setWho} /></div>}</>}
      {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog>;
}

export function Schedule() {
  const lang = useUiLang();
  const { member, workspace } = useApp(), office = member?.role === 'admin' || member?.role === 'staff', base = `/api/workspaces/${member?.workspace_id}`, tz = workspace?.timezone ?? 'Asia/Dubai';
  const today = localDate(Date.now(), tz), [from, setFrom] = useState(weekStart(today)), [day, setDay] = useState(today), [open, setOpen] = useState<Job | null>(null);
  const board = useResource<Board>(office ? `${base}/schedule?from=${from}&days=7` : null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(from, i)), [from]);
  if (member && !office) return <NoAccess />;
  const b = board.data, rows: (Person | null)[] = [...(b?.people ?? []), null];
  const awayOn = (pid: string | null, d: string) => pid ? (b?.away ?? []).find(a => a.user_id === pid && a.starts_on <= d && a.ends_on >= d) : undefined;
  const awayLabel = (k: string) => k === 'sick' ? 'Sick' : k === 'leave' ? 'On leave' : 'Day off';
  const cell = (pid: string | null, d: string) => (b?.jobs ?? []).filter(j => (j.assignee_id ?? null) === pid && j.day === d);
  const shift = (n: number) => { const f = addDays(from, n * 7); setFrom(f); setDay(f); };
  const pick = (d: string) => { setDay(d); if (d < from || d > addDays(from, 6)) setFrom(weekStart(d)); };
  const reload = () => { setOpen(null); void board.reload(); };
  const name = (p: Person | null) => p ? p.name ?? 'Team member' : 'Nobody yet';
  return <div className="page stack schedule-page">
    <PageHeader><div><h1>Schedule</h1></div></PageHeader>
    <div className="sched-nav"><Button variant="secondary" aria-label="Last week" onClick={() => shift(-1)}><ChevronLeft className="directional-icon" size={18} aria-hidden="true" /></Button><strong><span data-no-translate>{dayName(days[0], false, lang)}</span> to <span data-no-translate>{dayName(days[6], false, lang)}</span></strong><Button variant="secondary" aria-label="Next week" onClick={() => shift(1)}><ChevronRight className="directional-icon" size={18} aria-hidden="true" /></Button>{from !== weekStart(today) && <Button variant="secondary" onClick={() => { setFrom(weekStart(today)); setDay(today); }}>Today</Button>}</div>
    {board.loading ? <Skeleton className="skeleton-card" /> : board.error || !b ? <ErrorState retry={board.reload} /> : <>
      {/* Phone: one day, grouped by person */}
      <div className="sched-phone stack compact">
        <div className="sched-days" role="tablist" aria-label="Day">{days.map(d => { const n = (b.jobs).filter(j => j.day === d).length; return <button key={d} role="tab" aria-selected={d === day} className={`sched-day ${d === day ? 'on' : ''} ${d === today ? 'today' : ''}`} onClick={() => pick(d)}><span data-no-translate>{part(d, { weekday: 'short' }, lang)}</span><strong>{part(d, { day: 'numeric' })}</strong><small>{n || ''}</small></button>; })}</div>
        {(b.people).some(p => awayOn(p.user_id, day)) && <p className="small away-line">Away: {b.people.filter(p => awayOn(p.user_id, day)).map(p => `${p.name ?? 'Team member'} (${awayLabel(awayOn(p.user_id, day)!.kind)})`).join(', ')}</p>}
        {(b.jobs).some(j => j.day === day) ? rows.map(p => { const list = cell(p?.user_id ?? null, day); return list.length > 0 && <section key={p?.user_id ?? 'none'} className="stack compact"><h2 className="sched-person"><ContactName name={name(p)} userId={p?.user_id}/></h2>{list.map(j => <Chip key={j.id} j={j} onOpen={setOpen} />)}</section>; })
          : <EmptyState title="Nothing on this day">{b.unscheduled.length ? 'Pick a job below to give it a day.' : 'Jobs with a visit day show here.'}</EmptyState>}
      </div>
      {/* Desktop: the week, people down the side */}
      <div className="sched-week" role="table" aria-label="Week schedule">
        <div className="sched-row sched-head" role="row"><div role="columnheader" /> {days.map(d => <div key={d} role="columnheader" className={d === today ? 'today' : ''} data-no-translate>{dayName(d, false, lang)}</div>)}</div>
        {rows.map(p => <div key={p?.user_id ?? 'none'} className="sched-row" role="row"><div role="rowheader" className="sched-person"><ContactName name={name(p)} userId={p?.user_id}/></div>{days.map(d => <div key={d} role="cell" className={`sched-cell ${d === today ? 'today' : ''} ${awayOn(p?.user_id ?? null, d) ? 'away' : ''}`}>{awayOn(p?.user_id ?? null, d) && <span className="away-pill">{awayLabel(awayOn(p?.user_id ?? null, d)!.kind)}</span>}{cell(p?.user_id ?? null, d).map(j => <Chip key={j.id} j={j} onOpen={setOpen} />)}</div>)}</div>)}
      </div>
      <section className="stack compact"><h2><CalendarClock size={18} aria-hidden="true" /> Not scheduled ({b.unscheduled.length})</h2>
        {b.unscheduled.length ? <div className="sched-tray">{b.unscheduled.map(j => <Chip key={j.id} j={j} onOpen={x => setOpen({ ...x, day })} />)}</div> : <p className="small muted">Every open job has a day.</p>}</section>
    </>}
    {open && b && <MoveSheet j={open} base={base} tz={tz} people={b.people} onClose={() => setOpen(null)} onSaved={reload} />}
  </div>;
}
