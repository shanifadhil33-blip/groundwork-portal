'use client';
import { useState } from 'react';
import { Button, Card } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { useResource } from './resource';
import { DAY_REPLIES, type PlanLine } from '../../lib/day-plan';
import { WindowText } from './window-text';

export type DayPlanData = {
  can_plan: boolean;
  demo: boolean;
  summary: string;
  fingerprint: string;
  lines: PlanLine[];
  watch: (PlanLine & { fingerprint: string })[];
  gates: { id: string; order: number; title: string; window: string | null; hour?: number | null; span?: number }[];
  visits: { id: string; order: number; title: string }[];
  people: { id: string; name: string; away: string | null }[];
};

/** The reason starts with a person's name: the name stays as written, the rest is interface text the language file translates. */
function Why({ text, names }: { text: string; names: string[] }) {
  const name = names.filter(Boolean).sort((a, b) => b.length - a.length).find(n => text.startsWith(`${n} `));
  if (!name) return <p className="small">{text}</p>;
  return <p className="small"><span data-no-translate>{name}</span> <span>{text.slice(name.length + 1)}</span></p>;
}

function Line({ line, names = [] }: { line: PlanLine; names?: string[] }) {
  return <li className="stack compact" style={{ minWidth: 0 }}>
    <strong data-no-translate>WO {line.order} {line.title}</strong>
    {line.hour != null && <p><span>{DAY_REPLIES.arrival}</span>{' '}<WindowText hour={line.hour} /></p>}
    {line.assignee_name && <p data-no-translate>{line.assignee_name}</p>}
    <Why text={line.why} names={[line.assignee_name ?? '', ...names]} />
  </li>;
}

export function DayPlanView({ data, busy, error, notice, onApprove, onGate, onLate, onPreview }: {
  data: DayPlanData;
  busy: string;
  error: string;
  notice: string;
  onApprove: (kind: 'morning' | 'watch' | 'urgent' | 'sick', fingerprint: string, jobId?: string, personId?: string) => void;
  onGate: (id: string, action: 'confirm_gate' | 'skip_gate') => void;
  onLate: (id: string) => void;
  onPreview: (kind: 'urgent' | 'sick', jobId?: string, personId?: string) => void;
}) {
  const visits = data.visits ?? [];
  const people = data.people ?? [];
  const [job, setJob] = useState(visits[0]?.id ?? '');
  const [person, setPerson] = useState(people[0]?.id ?? '');
  return <div className="stack day-plan">
    {(data.can_plan || data.lines.length > 0) && <Card className="stack day-plan"><h2>{DAY_REPLIES.planAsk}</h2>
      {data.lines.length ? <p><bdi dir="ltr" data-no-translate>{data.lines.filter(l => l.kind === 'place').length}/{data.lines.length}</bdi> <span>open jobs can be placed.</span> <span>Nothing is saved until you say yes.</span></p> : <p>{DAY_REPLIES.nothingToPlan}</p>}
      {!!data.lines.length && <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.lines.map(line => <Line key={`${line.job_id}:${line.kind}`} line={line} names={people.map(p => p.name)} />)}</ul>}
      {data.can_plan && !!data.lines.some(line => line.kind === 'place') && <Button busy={busy === 'morning'} onClick={() => onApprove('morning', data.fingerprint)}>Approve the plan</Button>}
    </Card>}
    {!!data.watch.length && <Card className="stack day-plan"><h2>Running late</h2>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.watch.map(line => <li key={line.job_id}><Line line={line} />{data.can_plan && <Button busy={busy === line.job_id} onClick={() => onApprove('watch', line.fingerprint, line.job_id)}>Yes</Button>}</li>)}</ul>
    </Card>}
    {!!data.gates.length && <Card className="stack day-plan gate-list"><h2>{DAY_REPLIES.gateAsk}</h2>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.gates.map(gate => <li key={gate.id} className="stack compact">
        <span data-no-translate>WO {gate.order} {gate.title}</span>
        {gate.hour != null && <span><span>{DAY_REPLIES.arrival}</span>{' '}<WindowText hour={gate.hour} span={gate.span ?? 2} /></span>}
        <div className="row"><Button busy={busy === gate.id} onClick={() => onGate(gate.id, 'confirm_gate')}>Confirm gate pass</Button><Button variant="secondary" busy={busy === `${gate.id}:skip`} onClick={() => onGate(gate.id, 'skip_gate')}>Not needed</Button></div>
      </li>)}</ul>
    </Card>}
    {data.can_plan && <Card className="stack day-plan"><h2>Urgent call</h2>
      <label className="field"><span>Job</span><select value={job} onChange={e => setJob(e.target.value)}>{visits.map(visit => <option key={visit.id} value={visit.id}>{visit.order} {visit.title}</option>)}{!visits.length && <option value="">Nothing is waiting</option>}</select></label>
      <Button variant="secondary" busy={busy === 'urgent'} onClick={() => job && onPreview('urgent', job)}>Show the move</Button>
    </Card>}
    {data.can_plan && <Card className="stack day-plan"><h2>Off sick</h2>
      <label className="field"><span>Person</span><select value={person} onChange={e => setPerson(e.target.value)}>{people.map(who => <option key={who.id} value={who.id}>{who.name}</option>)}</select></label>
      <Button variant="secondary" busy={busy === 'sick'} onClick={() => person && onPreview('sick', undefined, person)}>Show the move</Button>
    </Card>}
    {data.demo && !!visits.length && <Card className="stack day-plan"><h2>Mark this job late</h2><p>This practice control marks the job late. No message is sent.</p>
      <Button variant="secondary" busy={busy === 'late'} onClick={() => onLate(visits[0].id)}>Mark this job late</Button>
    </Card>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function DayPlan({ base }: { base: string }) {
  const plan = useResource<DayPlanData>(`${base}/day-plan`);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [extra, setExtra] = useState<{ kind: 'urgent' | 'sick'; fingerprint: string; job_id?: string; person_id?: string; summary: string; lines: PlanLine[] } | null>(null);
  if (!plan.data || !Array.isArray(plan.data.lines) || !Array.isArray(plan.data.gates) || !Array.isArray(plan.data.watch)) return null;
  const data = plan.data;
  if (!data.can_plan && !data.lines.length && !data.gates.length && !data.watch.length) return null;
  async function send(path: string, body: unknown, key: string) {
    setBusy(key); setError('');
    try {
      const result = await post<{ reply?: string; fingerprint?: string; summary?: string }>(`${base}/day-plan`, body);
      setNotice(result.reply ?? '');
      setExtra(null);
      await plan.reload();
    } catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(''); }
  }
  return <>
    <DayPlanView data={data} busy={busy} error={error} notice={notice}
      onApprove={(kind, fingerprint, jobId, personId) => void send('approve', { action: 'approve', kind, fingerprint, job_id: jobId, person_id: personId }, kind === 'watch' ? (jobId ?? kind) : kind)}
      onGate={(id, action) => void send(action, { action, job_id: id }, action === 'skip_gate' ? `${id}:skip` : id)}
      onLate={id => void send('late', { action: 'mark_late', job_id: id }, 'late')}
      onPreview={(kind, jobId, personId) => void (async () => {
        setBusy(kind); setError('');
        try {
          const result = await post<{ reply?: string; fingerprint: string; summary: string; lines?: PlanLine[] }>(`${base}/day-plan`, { action: 'preview', kind, job_id: jobId, person_id: personId });
          setExtra({ kind, fingerprint: result.fingerprint, job_id: jobId, person_id: personId, summary: result.summary, lines: result.lines ?? [] });
        } catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
        finally { setBusy(''); }
      })()} />
    {extra && <Card className="stack day-plan"><p data-no-translate>{extra.summary}</p>{!!extra.lines.length && <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{extra.lines.map(line => <Line key={`${line.job_id}:${line.kind}`} line={line} />)}</ul>}<p>{DAY_REPLIES.approve}</p><Button busy={busy === extra.kind} onClick={() => void send('approve', { action: 'approve', kind: extra.kind, fingerprint: extra.fingerprint, job_id: extra.job_id, person_id: extra.person_id }, extra.kind)}>Yes</Button></Card>}
  </>;
}
