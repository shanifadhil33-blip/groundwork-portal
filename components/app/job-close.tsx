'use client';
import { useState } from 'react';
import { Button, Card, ConfirmDialog, LocalTime } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { useResource } from './resource';
import { doneCard, englishCopyMark } from '../../lib/job-close';

export type CloseState = {
  can_sign_off: boolean;
  signed_off: boolean;
  can_mark: boolean;
  marked: boolean;
  photos: { before: number; after: number; total: number };
  draft: { lines: { label: string; detail: string; amount: string | null }[]; status: string; cost: string | null; can_keep: boolean; waiting: string } | null;
  card: { problem: string; fix: string; outcome: string; technician: string; when: string | null; cost: string | null; waiting: string | null; thanks: string | null };
};

export function EnglishCopy({ language, text }: { language?: string | null; text?: string | null }) {
  const mark = englishCopyMark(language, text);
  if (!mark) return null;
  return <span className="report-en"><span className="badge">{mark.label}</span> <span data-no-translate>{mark.text}</span></span>;
}

export function FullDoneCard({ outcome, name, problem, work, before, after, onClose }: { outcome: string; name: string; problem: string; work: string; before: number; after: number; onClose: () => void }) {
  const card = doneCard({ outcome, name, problem, work, before, after });
  return <div className="done-screen" role="dialog" aria-modal="true" aria-label={card.title}>
    <h2>{card.title}</h2>
    {card.name ? <p data-no-translate>{card.name}</p> : null}
    <dl>{card.lines.map(line => <div key={line.label}><dt>{line.label}</dt><dd data-no-translate>{line.value}</dd></div>)}</dl>
    <Button variant="secondary" onClick={onClose}>Close</Button>
  </div>;
}

export function JobCloseView({ state, currency, busy, error, onSign, onMark, onKeep }: { state: CloseState; currency: string; busy: boolean; error: string; onSign: () => void; onMark: () => void; onKeep: () => void }) {
  const card = state.card;
  return <div className="stack job-close">
    <Card className="stack job-done-card"><h2>Job done</h2>
      <dl className="metadata">
        <dt>The problem</dt><dd data-no-translate>{card.problem || 'Not set yet'}</dd>
        <dt>What was done</dt><dd data-no-translate>{card.fix || 'Not set yet'}</dd>
        <dt>How it ended</dt><dd>{card.outcome}</dd>
        <dt>Technician</dt><dd data-no-translate>{card.technician || 'Not set yet'}</dd>
        {card.when ? <><dt>Reported</dt><dd><LocalTime value={card.when}/></dd></> : null}
        <dt>Before photos</dt><dd>{state.photos.before || 'No photos'}</dd>
        <dt>After photos</dt><dd>{state.photos.after || 'No photos'}</dd>
        {card.cost || card.waiting ? <><dt>Cost</dt><dd data-no-translate={card.cost ? true : undefined}>{card.cost ? `${currency} ${card.cost}` : card.waiting}</dd></> : null}
      </dl>
      {card.thanks && <p role="status">{card.thanks}</p>}
      {state.signed_off && <p>Signed off. This stays on the job.</p>}
      {state.can_sign_off && <Button busy={busy} onClick={onSign}>Sign off</Button>}
    </Card>
    {state.marked && <p role="status">Marked. This closed job has no photos.</p>}
    {state.can_mark && <Button variant="secondary" busy={busy} onClick={onMark}>Mark no photos</Button>}
    {state.draft && <Card className="stack"><h2>Draft bill</h2>
      <ul className="stack compact" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{state.draft.lines.map(line => <li key={`${line.label}:${line.detail}`}><span>{line.label}</span> <span data-no-translate>{line.detail}</span> <span data-no-translate>{line.amount ? `${currency} ${line.amount}` : state.draft?.waiting}</span></li>)}</ul>
      <p>{state.draft.status === 'kept' ? 'The owner kept this draft. It is not sent.' : 'Waiting for the owner'}</p>
      {state.draft.can_keep && <Button busy={busy} onClick={onKeep}>Keep this draft</Button>}
    </Card>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

const asks = { sign_off: 'Sign off this finished job? This cannot be undone.', no_photos: 'Mark this closed job as having no photos?', keep_draft: 'Keep this draft?' } as const;
export function JobClose({ base, id, currency }: { base: string; id: string; currency: string }) {
  const state = useResource<CloseState>(`${base}/work-orders/${id}/close`);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [ask, setAsk] = useState<keyof typeof asks | null>(null);
  async function run(action: keyof typeof asks) {
    setBusy(true); setError('');
    try { await post(`${base}/work-orders/${id}/close`, { action }); setAsk(null); await state.reload(); }
    catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  }
  if (!state.data?.card) return null;
  return <>
    <JobCloseView state={state.data} currency={currency} busy={busy} error={error} onSign={() => setAsk('sign_off')} onMark={() => setAsk('no_photos')} onKeep={() => setAsk('keep_draft')} />
    <ConfirmDialog open={!!ask} title={ask ? asks[ask] : ''} confirmLabel="Yes" busy={busy} error={error} onClose={() => setAsk(null)} onConfirm={() => { if (ask) void run(ask); }}><p>Nothing changes until you say yes.</p></ConfirmDialog>
  </>;
}
