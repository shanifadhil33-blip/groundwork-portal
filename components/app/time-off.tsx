'use client';
import { useState } from 'react';
import { formatInLang } from '../../lib/date-lang';
import { Button, Dialog, useToast, Dropdown } from '../ui';
import { request, RequestError } from '../../lib/ui/api';
import { useResource } from './resource';

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const KINDS = [{ v: 'leave', label: 'On leave' }, { v: 'sick', label: 'Sick' }, { v: 'off', label: 'Day off' }];
const kindLabel = (k: string) => KINDS.find(x => x.v === k)?.label ?? k;
type Person = { user_id: string; name: string | null; role: string; off_days?: number[] };
type Entry = { id: string; user_id: string; name: string | null; kind: string; starts_on: string; ends_on: string; note: string | null };
const nice = (d: string) => formatInLang(new Date(`${d}T00:00:00Z`), { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const today = () => new Date().toLocaleDateString('sv');

/** Weekly days off. Tap a day to turn it on or off. Jobs are never given to someone on his day off. */
export function OffDaysButton({ p, base, onDone }: { p: Person; base: string; onDone: () => void }) {
  const [open, setOpen] = useState(false), [days, setDays] = useState<number[]>(p.off_days ?? []), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save() { setBusy(true); setError(''); try { await request(`${base}/members/${p.user_id}/off-days`, { method: 'PUT', body: JSON.stringify({ off_days: days }) }); setOpen(false); onDone(); } catch { setError('We could not save. Try again.'); } finally { setBusy(false); } }
  return <><Button variant="secondary" onClick={() => { setDays(p.off_days ?? []); setOpen(true); }}>Days off</Button>
    <Dialog open={open} onClose={() => setOpen(false)} busy={busy} title={`${p.name ?? 'Their'} weekly days off`} footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="stack compact"><p className="small">Jobs are not given to {p.name ?? 'them'} on these days.</p>
        <div className="offday-row">{DAYS.map((d, i) => <button key={d} type="button" className={`offday ${days.includes(i) ? 'on' : ''}`} aria-pressed={days.includes(i)} disabled={busy} onClick={() => setDays(days.includes(i) ? days.filter(x => x !== i) : [...days, i].sort())}>{d}</button>)}</div>
        {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog></>;
}

/** The leave calendar: who is away and when. The office adds and removes entries. */
export function LeaveCalendar({ base, people, readOnly }: { base: string; people: Person[]; readOnly?: boolean }) {
  const list = useResource<{ time_off: Entry[] }>(`${base}/time-off`), toast = useToast();
  const workers = people.filter(p => p.role !== 'client');
  const [open, setOpen] = useState(false), [who, setWho] = useState(''), [kind, setKind] = useState('leave'), [from, setFrom] = useState(today()), [to, setTo] = useState(today()), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function add() {
    setBusy(true); setError('');
    try {
      const r = await request<{ clashes?: { title: string }[]; reopened?: number }>(`${base}/time-off`, { method: 'POST', body: JSON.stringify({ user_id: who || workers[0]?.user_id, kind, starts_on: from, ends_on: to < from ? from : to }) });
      setOpen(false); void list.reload();
      toast(r.reopened ? `Saved. ${r.reopened === 1 ? '1 job went' : `${r.reopened} jobs went`} back to Open.` : r.clashes?.length ? `Saved. ${r.clashes.length} booked ${r.clashes.length === 1 ? 'job needs' : 'jobs need'} someone else.` : 'Saved.');
    } catch (e) { setError(e instanceof RequestError ? e.message : 'We could not save. Try again.'); } finally { setBusy(false); }
  }
  async function remove(id: string) { try { await request(`${base}/time-off/${id}`, { method: 'DELETE' }); void list.reload(); toast('Removed.'); } catch { toast('That did not save. Try again.'); } }
  const rows = list.data?.time_off ?? [];
  return <section className="stack compact card leave-calendar"><div className="heading-row"><h2>Leave</h2>{!readOnly && <Button variant="secondary" onClick={() => { setWho(workers[0]?.user_id ?? ''); setFrom(today()); setTo(today()); setKind('leave'); setOpen(true); }}>Add leave</Button>}</div>
    {rows.length ? <ul className="timeoff-list">{rows.map(e => <li key={e.id}><span><strong>{e.name ?? 'Team member'}</strong> · {kindLabel(e.kind)}{(e as Entry & { status?: string }).status === 'pending' ? ' (waiting)' : ''} · {e.starts_on === e.ends_on ? <span data-no-translate>{nice(e.starts_on)}</span> : <><span data-no-translate>{nice(e.starts_on)}</span> to <span data-no-translate>{nice(e.ends_on)}</span></>}</span>{!readOnly && <Button variant="secondary" onClick={() => void remove(e.id)} aria-label={`Remove leave for ${e.name ?? 'them'}`}>Remove</Button>}</li>)}</ul>
      : <p className="small muted">Nobody is away. Add leave here, and jobs are not given to that person on those days.</p>}
    <Dialog open={open} onClose={() => setOpen(false)} busy={busy} title="Add leave" footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} onClick={add}>Save</Button></>}>
      <div className="stack compact">
        <label className="field"><span>Who</span><Dropdown label="Person" width={320} value={who} onChange={setWho} options={workers.map(p => ({ value: p.user_id, label: p.name ?? 'Team member', noTranslate: !!p.name }))} /></label>
        <label className="field"><span>Why</span><Dropdown label="Reason" width={320} value={kind} onChange={setKind} options={KINDS.map(k => ({ value: k.v, label: k.label }))} /></label>
        <div className="row"><label className="field"><span>From</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} /></label><label className="field"><span>To</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label></div>
        {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog>
  </section>;
}

type Ask = { id: string; user_id: string; name: string | null; kind: string; status: string; starts_on: string; ends_on: string; note: string | null };
const span = (e: { starts_on: string; ends_on: string }) => e.starts_on === e.ends_on ? nice(e.starts_on) : `${nice(e.starts_on)} to ${nice(e.ends_on)}`;
const statusWord: Record<string, string> = { pending: 'Waiting', approved: 'Approved', declined: 'Declined' };

/** TEAM06: the Request time off button. The same thing the agent does when he says "I'm off Thursday". */
export function RequestTimeOff({ base, onDone }: { base: string; onDone?: () => void }) {
  const toast = useToast(), [open, setOpen] = useState(false), [kind, setKind] = useState('off'), [from, setFrom] = useState(today()), [to, setTo] = useState(today()), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function send() {
    setBusy(true); setError('');
    try { await request(`${base}/time-off/request`, { method: 'POST', body: JSON.stringify({ kind, starts_on: from, ends_on: to < from ? from : to }) }); setOpen(false); toast('Sent. Your supervisor will reply.'); onDone?.(); }
    catch (e) { setError(e instanceof RequestError ? e.message : 'We could not send. Try again.'); } finally { setBusy(false); }
  }
  return <><Button variant="secondary" onClick={() => { setFrom(today()); setTo(today()); setKind('off'); setError(''); setOpen(true); }}>Request time off</Button>
    <Dialog open={open} onClose={() => setOpen(false)} busy={busy} title="Request time off" footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy} onClick={send}>Send</Button></>}>
      <div className="stack compact"><p className="small">Your supervisor says yes or no. You get a message.</p>
        <label className="field"><span>Why</span><Dropdown label="Reason" width={320} value={kind} onChange={setKind} options={KINDS.map(k => ({ value: k.v, label: k.label }))} /></label>
        <div className="row"><label className="field"><span>From</span><input type="date" value={from} min={today()} onChange={e => setFrom(e.target.value)} /></label><label className="field"><span>To</span><input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} /></label></div>
        {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog></>;
}

/** Home: requests waiting for a decision (admin and supervisor), or your own requests and their answer. */
export function LeaveRequests({ base, self }: { base: string; self: string }) {
  const list = useResource<{ can_decide: boolean; requests: Ask[] }>(`${base}/time-off/request`), toast = useToast(), [busy, setBusy] = useState('');
  async function decide(id: string, decision: 'approved' | 'declined') {
    setBusy(id); try { await request(`${base}/time-off/${id}/decision`, { method: 'PUT', body: JSON.stringify({ decision }) }); toast(decision === 'approved' ? 'Approved. It shows on the schedule.' : 'Declined.'); void list.reload(); }
    catch (e) { toast(e instanceof RequestError ? e.message : 'That did not save. Try again.'); } finally { setBusy(''); }
  }
  const rows = list.data?.requests ?? [], canDecide = !!list.data?.can_decide;
  const waiting = rows.filter(r => r.status === 'pending' && r.user_id !== self), mine = rows.filter(r => r.user_id === self);
  if (!waiting.length && !mine.length) return null;
  return <section className="card stack compact leave-requests">
    {canDecide && waiting.length > 0 && <><h2>Time off requests</h2><ul>{waiting.map(r => <li key={r.id}><span><strong>{r.name ?? 'Team member'}</strong> · {kindLabel(r.kind)} · {span(r)}</span><div className="row"><Button variant="secondary" size="sm" busy={busy === r.id} onClick={() => void decide(r.id, 'approved')}>Approve</Button><Button size="sm" variant="secondary" disabled={busy === r.id} onClick={() => void decide(r.id, 'declined')}>Decline</Button></div></li>)}</ul></>}
    {mine.length > 0 && <><h2>My time off</h2><ul>{mine.map(r => <li key={r.id}><span>{kindLabel(r.kind)} · {span(r)}</span><strong className="small">{statusWord[r.status] ?? r.status}</strong></li>)}</ul></>}
  </section>;
}
