'use client';
import Link from 'next/link';
import { useState } from 'react';
import { AlarmClock, CalendarCheck, CheckCircle2, MapPin, PartyPopper, Phone, Play } from 'lucide-react';
import { PageHeader } from '../ui/layout';
import { Badge, Button, Dialog, EmptyState, ErrorState, Skeleton, useToast } from '../ui';
import { request, RequestError } from '../../lib/ui/api';
import { statusLabels } from '../../lib/ui/work-orders';
import { tradeLabels, type Trade } from '../../lib/trades';
import { useApp } from './context';
import { useResource } from './resource';
import { NoAccess } from './no-access';
import { AddPhoto, type Photo } from './job-photos';
import { AgentCard } from './dashboard';
import { LeaveRequests, RequestTimeOff } from './time-off';

type Job = { id: string; order_number: number; title: string; status: string; priority: string; trade: string | null; scheduled_for: string | null; due_on: string | null; updated_at: string; site_name: string; address: string | null; building: string | null; area: string | null; access_notes: string | null; contact_name: string | null; contact_phone: string | null };
type Day = { timezone: string; today: Job[]; late: Job[]; next: Job[]; done: number };

/** The one next step for a worker. Open jobs wait for the office to set a time. */
export function nextStep(status: string): { to: string; label: string } | null {
  if (status === 'scheduled' || status === 'waiting_on_parts') return { to: 'in_progress', label: 'Start' };
  if (status === 'in_progress') return { to: 'done', label: 'Done' };
  return null;
}
const time = (v: string | null, tz: string) => v ? new Intl.DateTimeFormat('en', { hour: 'numeric', minute: '2-digit', timeZone: tz }).format(new Date(v)) : '';
const day = (v: string | null, tz: string) => v ? new Intl.DateTimeFormat('en', { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }).format(new Date(v)) : '';
const mapUrl = (j: Job) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([j.building, j.address, j.area].filter(Boolean).join(', ') || j.site_name)}`;

type Outcome = 'fixed' | 'temporary' | 'needs_part' | 'cant_fix';
type JobRecord = { month: number; total: number };
const OUTCOMES: { v: Outcome; label: string; hint: string }[] = [
  { v: 'fixed', label: 'Fixed', hint: 'The job is finished.' },
  { v: 'temporary', label: 'Temporary fix', hint: 'It works for now. The office will plan a return visit.' },
  { v: 'needs_part', label: 'Needs a part', hint: 'The job waits until the part comes.' },
  { v: 'cant_fix', label: "Can't be fixed", hint: 'Your supervisor will look at it.' },
];

/** The job report: what was wrong, what you did, how it ended. Nothing here is required, and the after photo never blocks finishing. */
function DoneDialog({ j, base, onClose, onSaved }: { j: Job; base: string; onClose: () => void; onSaved: (outcome: Outcome, record: JobRecord) => void }) {
  const photos = useResource<Photo[]>(`${base}/work-orders/${j.id}/photos`), after = (Array.isArray(photos.data) ? photos.data : []).filter(p => p.kind === 'after').length;
  const [problem, setProblem] = useState(''), [work, setWork] = useState(''), [outcome, setOutcome] = useState<Outcome>('fixed'), [busy, setBusy] = useState(false), toast = useToast();
  async function save() {
    setBusy(true);
    try { const r = await request<{ record: JobRecord }>(`${base}/work-orders/${j.id}/report`, { method: 'POST', body: JSON.stringify({ problem, work, outcome, updated_at: j.updated_at }) }); onSaved(outcome, r.record); }
    catch (e) { toast(e instanceof RequestError && e.status === 409 ? 'This job changed. We loaded the new version.' : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  }
  const pick = OUTCOMES.find(o => o.v === outcome)!;
  return <Dialog open onClose={onClose} busy={busy} title="Job report" footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button busy={busy} onClick={() => void save()}><CheckCircle2 size={18} aria-hidden="true" />{outcome === 'fixed' || outcome === 'temporary' ? 'Job done' : 'Save report'}</Button></>}>
    <div className="stack compact job-report"><strong data-no-translate>{j.title}</strong>
      <label className="field"><span>What was the problem?</span><textarea rows={2} value={problem} onChange={e => setProblem(e.target.value)} placeholder="For example: the AC was leaking water" /></label>
      <label className="field"><span>What did you do?</span><textarea rows={2} value={work} onChange={e => setWork(e.target.value)} placeholder="For example: cleaned the drain pipe" /></label>
      <fieldset className="outcome-pick"><legend>How did it end?</legend>
        <div className="outcome-grid">{OUTCOMES.map(o => <button key={o.v} type="button" className={`outcome ${outcome === o.v ? 'on' : ''}`} aria-pressed={outcome === o.v} onClick={() => setOutcome(o.v)}>{o.label}</button>)}</div>
        <p className="small muted">{pick.hint}</p></fieldset>
      {after ? <p className="small">After photos: {after}</p> : <p className="small">An after photo shows the client the work is done.</p>}
      <div><AddPhoto base={base} id={j.id} kind="after" primary={false} onAdded={() => void photos.reload()} /></div></div>
  </Dialog>;
}

function JobCard({ j, tz, base, onDone, onFinished, when }: { j: Job; tz: string; base: string; onDone: () => void; onFinished: (o: Outcome, r: JobRecord) => void; when: string }) {
  const step = nextStep(j.status), [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false), toast = useToast();
  async function go() {
    if (!step) return; setBusy(true);
    try { await request(`${base}/work-orders/${j.id}`, { method: 'PATCH', body: JSON.stringify({ status: step.to, updated_at: j.updated_at }) }); toast('Started.'); onDone(); }
    catch (e) { toast(e instanceof RequestError && e.status === 409 ? 'This job changed. We loaded the new version.' : 'That did not save. Try again.'); onDone(); }
    finally { setBusy(false); }
  }
  return <li className="day-card">
    <div className="day-when"><strong>{when}</strong>{j.status !== 'scheduled' && <Badge>{statusLabels[j.status] ?? j.status}</Badge>}{j.priority === 'urgent' && <Badge tone="danger">Urgent</Badge>}</div>
    <Link href={`/work-orders/${j.id}`} className="day-title"><strong data-no-translate>{j.title}</strong><span className="small muted">{[j.site_name, j.area].filter(Boolean).join(' · ')}{j.trade ? ` · ${tradeLabels[j.trade as Trade] ?? j.trade}` : ''}</span></Link>
    {j.access_notes && <p className="small day-note">{j.access_notes}</p>}
    <div className="day-actions">
      {step ? <Button busy={busy} onClick={() => step.to === 'done' ? setConfirm(true) : void go()}>{step.to === 'done' ? <CheckCircle2 size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}{step.label}</Button> : <span className="small muted">Waiting for a time</span>}
      <a className="button secondary" href={mapUrl(j)} target="_blank" rel="noreferrer"><MapPin size={18} aria-hidden="true" />Map</a>
      {j.contact_phone && <a className="button secondary" href={`tel:${j.contact_phone.replace(/[^+0-9]/g, '')}`} aria-label={`Call ${j.contact_name ?? 'the site'}`}><Phone size={18} aria-hidden="true" />Call</a>}
    </div>
    {confirm && <DoneDialog j={j} base={base} onClose={() => setConfirm(false)} onSaved={(o, r) => { setConfirm(false); onFinished(o, r); onDone(); }} />}
  </li>;
}

const moment: Record<Outcome, string> = { fixed: 'Job done. Great work!', temporary: 'Job done for now. The office will plan the return visit.', needs_part: 'Report saved. The job waits for the part.', cant_fix: 'Report saved. Your supervisor will take it from here.' };

/** The "job done" moment: a short thank you and this month's count. */
function DoneMoment({ outcome, record, onClose }: { outcome: Outcome; record: JobRecord; onClose: () => void }) {
  return <div className="done-moment" role="status"><PartyPopper size={28} aria-hidden="true" />
    <div><strong>{moment[outcome]}</strong><p className="small">You finished {record.month} {record.month === 1 ? 'job' : 'jobs'} this month and {record.total} in total.</p></div>
    <Button variant="secondary" onClick={onClose}>Close</Button></div>;
}

export function MyDay() {
  const { member } = useApp(), base = `/api/workspaces/${member?.workspace_id}`, d = useResource<Day>(member && member.role !== 'client' ? `${base}/my-day` : null);
  const { me } = useApp();
  const rec = useResource<JobRecord>(member && member.role !== 'client' ? `${base}/members/${me.user.id}/record` : null);
  const [done, setDone] = useState<{ outcome: Outcome; record: JobRecord } | null>(null);
  if (member?.role === 'client') return <NoAccess />;
  const data = d.data, tz = data?.timezone ?? 'Asia/Dubai', reload = () => { void d.reload(); void rec.reload(); };
  const finished = (outcome: Outcome, record: JobRecord) => setDone({ outcome, record });
  return <div className="page stack my-day">
    <PageHeader><div><h1>Today</h1><p>{new Intl.DateTimeFormat('en', { weekday: 'long', day: 'numeric', month: 'long', timeZone: tz }).format(new Date())}</p>{rec.data && <p className="small job-count">Jobs done: {rec.data.month} this month, {rec.data.total} in total</p>}</div></PageHeader>
    {member?.role === 'technician' && <AgentCard />}
    {member && <div className="row"><RequestTimeOff base={`/api/workspaces/${member.workspace_id}`} /></div>}
    {member && <LeaveRequests base={`/api/workspaces/${member.workspace_id}`} self={me.user.id} />}
    {done && <DoneMoment outcome={done.outcome} record={done.record} onClose={() => setDone(null)} />}
    {d.loading ? <Skeleton className="skeleton-card" /> : d.error || !data ? <ErrorState retry={d.reload} /> : <>
      <div className="tiles tiles-3">
        <a href="#today" className="tile"><CalendarCheck size={22} aria-hidden="true" /><strong>{data.today.length}</strong><span>Today</span></a>
        <a href="#late" className={`tile ${data.late.length ? 'tile-danger' : ''}`}><AlarmClock size={22} aria-hidden="true" /><strong>{data.late.length}</strong><span>Late</span></a>
        <div className="tile"><CheckCircle2 size={22} aria-hidden="true" /><strong>{data.done}</strong><span>Done</span></div>
      </div>
      {data.late.length > 0 && <section id="late" className="stack compact"><h2>Late</h2><ul className="day-list">{data.late.map(j => <JobCard key={j.id} j={j} tz={tz} base={base} onDone={reload} onFinished={finished} when={`Due ${day(j.due_on, tz)}`} />)}</ul></section>}
      <section id="today" className="stack compact"><h2>Today</h2>{data.today.length ? <ul className="day-list">{data.today.map(j => <JobCard key={j.id} j={j} tz={tz} base={base} onDone={reload} onFinished={finished} when={time(j.scheduled_for, tz)} />)}</ul>
        : <EmptyState title={data.done ? 'All done for today' : 'No jobs today'}>{data.next[0] ? `Next: ${data.next[0].title}, ${day(data.next[0].scheduled_for, tz)}.` : 'When the office gives you a job, it shows here.'}</EmptyState>}</section>
      {data.next.length > 0 && <section className="stack compact"><h2>Next days</h2><ul className="day-list">{data.next.map(j => <li key={j.id} className="day-next"><Link href={`/work-orders/${j.id}`}><strong>{day(j.scheduled_for, tz)}</strong> {time(j.scheduled_for, tz)} · {j.title}</Link></li>)}</ul></section>}
      <p className="small"><Link href="/work-orders">All my jobs</Link></p>
    </>}
  </div>;
}
