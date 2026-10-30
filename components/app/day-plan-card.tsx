'use client';
import { Translated } from './app-words';
import { useState } from 'react';
import { Button, Card } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { useResource } from './resource';
import { DAY_REPLIES, type PlanLine } from '../../lib/day-plan';

/** SCHED04 simplified (Adhil, Oct 20 2026): who does which job, the owner or a supervisor says yes. No arrival windows, no urgent or sick moves, no gate list. */
export type DayPlanData = {
  can_plan: boolean;
  demo: boolean;
  summary: string;
  fingerprint: string;
  lines: PlanLine[];
  watch: (PlanLine & { fingerprint: string })[];
  visits: { id: string; order: number; title: string }[];
  people: { id: string; name: string; away: string | null }[];
};

/** The reason starts with a person's name: the name stays as written, the rest is interface text the language file translates. */
function Why({ text, names }: { text: string; names: string[] }) {
  const name = names.filter(Boolean).sort((a, b) => b.length - a.length).find(n => text.startsWith(`${n} `));
  if (!name) return <Translated><p className="small">{text}</p></Translated>;
  return <Translated><p className="small"><span data-no-translate>{name}</span> <span>{text.slice(name.length + 1)}</span></p></Translated>;
}

function Line({ line, names = [] }: { line: PlanLine; names?: string[] }) {
  return <Translated><li className="stack compact" style={{ minWidth: 0 }}>
    <strong data-no-translate>WO {line.order} {line.title}</strong>
    {line.assignee_name && <p data-no-translate>{line.assignee_name}</p>}
    <Why text={line.why} names={[line.assignee_name ?? '', ...names]} />
  </li></Translated>;
}

export function DayPlanView({ data, busy, error, notice, onApprove, onLate }: {
  data: DayPlanData;
  busy: string;
  error: string;
  notice: string;
  onApprove: (kind: 'morning' | 'watch', fingerprint: string, jobId?: string) => void;
  onLate: (id: string) => void;
}) {
  const visits = data.visits ?? [];
  const people = data.people ?? [];
  return <Translated><div className="stack day-plan">
    {(data.can_plan || data.lines.length > 0) && <Card className="stack day-plan"><h2>{DAY_REPLIES.planAsk}</h2>
      {data.lines.length ? <p><bdi dir="ltr" data-no-translate>{data.lines.filter(l => l.kind === 'place').length}/{data.lines.length}</bdi> <span>open jobs can be placed.</span> <span>Nothing is saved until you say yes.</span></p> : <p>{DAY_REPLIES.nothingToPlan}</p>}
      {!!data.lines.length && <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.lines.map(line => <Line key={`${line.job_id}:${line.kind}`} line={line} names={people.map(p => p.name)} />)}</ul>}
      {data.can_plan && !!data.lines.some(line => line.kind === 'place') && <Button busy={busy === 'morning'} onClick={() => onApprove('morning', data.fingerprint)}>Approve the plan</Button>}
    </Card>}
    {!!data.watch.length && <Card className="stack day-plan"><h2>Running late</h2>
      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{data.watch.map(line => <li key={line.job_id}><Line line={line} />{data.can_plan && line.kind === 'place' && <Button busy={busy === line.job_id} onClick={() => onApprove('watch', line.fingerprint, line.job_id)}>Yes</Button>}</li>)}</ul>
    </Card>}
    {data.demo && !!visits.length && <Card className="stack day-plan"><h2>Mark this job late</h2><p>This practice control marks the job late. No message is sent.</p>
      <Button variant="secondary" busy={busy === 'late'} onClick={() => onLate(visits[0].id)}>Mark this job late</Button>
    </Card>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </div></Translated>;
}

export function DayPlan({ base }: { base: string }) {
  const plan = useResource<DayPlanData>(`${base}/day-plan`);
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState('');
  if (!plan.data || !Array.isArray(plan.data.lines) || !Array.isArray(plan.data.watch)) return null;
  const data = plan.data;
  if (!data.can_plan && !data.lines.length && !data.watch.length) return null;
  async function send(body: unknown, key: string) {
    setBusy(key); setError('');
    try {
      const result = await post<{ reply?: string }>(`${base}/day-plan`, body);
      setNotice(result.reply ?? '');
      await plan.reload();
    } catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(''); }
  }
  return <Translated><DayPlanView data={data} busy={busy} error={error} notice={notice}
    onApprove={(kind, fingerprint, jobId) => void send({ action: 'approve', kind, fingerprint, job_id: jobId }, kind === 'watch' ? (jobId ?? kind) : kind)}
    onLate={id => void send({ action: 'mark_late', job_id: id }, 'late')} /></Translated>;
}
