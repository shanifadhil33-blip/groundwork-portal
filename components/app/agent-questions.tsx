'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useApp } from './context';
import { useResource } from './resource';
import { post, RequestError } from '../../lib/ui/api';
import { Button } from '../ui';
type Q = { id: string; question: string; proposed: string; asked_by_name: string | null; order_number: number | null; work_order_id: string | null; created_at: string };
/** TEAM09: the Agent's open questions for a supervisor. Approve the suggestion or write the right answer. */
export function AgentQuestions({ base }: { base: string }) {
  const { member } = useApp(), lead = member?.role === 'admin' || (member?.role === 'staff' && (member as { staff_kind?: string }).staff_kind !== 'office');
  const r = useResource<{ data: Q[] }>(lead ? `${base}/agent-questions` : null), [fixing, setFixing] = useState<string | null>(null), [answer, setAnswer] = useState(''), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  if (!lead || !r.data?.data?.length) return null;
  async function decide(q: Q, decision: 'approve' | 'fix') { setBusy(q.id); setError(''); try { await post(`${base}/agent-questions/${q.id}`, decision === 'fix' ? { decision, answer } : { decision }); setFixing(null); setAnswer(''); void r.reload(); } catch (e) { setError(e instanceof RequestError ? e.message : 'Could not send. Try again.'); } finally { setBusy(null); } }
  return <section className="stack compact agent-questions"><h2>Agent needs your call</h2><ul className="action-list">{r.data.data.map(q => <li key={q.id} className="stack compact"><p><span data-no-translate>{q.asked_by_name ?? 'Someone'}</span> asked{q.order_number ? <> about <Link href={`/work-orders/${q.work_order_id}`}>WO {q.order_number}</Link></> : null}:</p><strong data-no-translate>{q.question}</strong>{q.proposed && <p className="muted">Agent suggests: <span data-no-translate>{q.proposed}</span></p>}
    {fixing === q.id ? <><label className="field"><span>The right answer</span><textarea rows={2} value={answer} maxLength={1000} onChange={e => setAnswer(e.target.value)} /></label><div className="row"><Button busy={busy === q.id} disabled={!answer.trim()} onClick={() => void decide(q, 'fix')}>Send answer</Button><Button variant="ghost" onClick={() => setFixing(null)}>Cancel</Button></div></>
      : <div className="row">{q.proposed && <Button busy={busy === q.id} onClick={() => void decide(q, 'approve')}>Yes, approve</Button>}<Button variant="secondary" onClick={() => { setFixing(q.id); setAnswer(''); }}>{q.proposed ? 'Fix it' : 'Answer'}</Button></div>}</li>)}</ul>{error && <p role="alert">{error}</p>}</section>;
}
type Mine = Q & { status: 'open' | 'approved' | 'fixed'; answer: string | null; decided_by_name: string | null };
/** TEAM09: the person who asked sees where his question stands, and the answer, on his own screen (a push can be missed). */
export function MyAgentQuestions({ base }: { base: string }) {
  const r = useResource<{ data: Mine[] }>(`${base}/agent-questions?mine=1`);
  if (!r.data?.data?.length) return null;
  return <section className="stack compact my-agent-questions" aria-label="Your questions to a supervisor"><h2>Your questions</h2><ul className="action-list">{r.data.data.slice(0, 3).map(q => <li key={q.id} className="stack compact">
    <strong data-no-translate>{q.question}</strong>{q.order_number ? <p className="small"><Link href={`/work-orders/${q.work_order_id}`}>WO {q.order_number}</Link></p> : null}
    {q.status === 'open' ? <p className="muted">Waiting for your supervisor. Nothing changes until they answer.</p>
      : <p>{q.status === 'approved' ? 'Supervisor said yes' : 'Supervisor answered'}{q.decided_by_name ? <> (<span data-no-translate>{q.decided_by_name}</span>)</> : null}: {q.answer ? <span data-no-translate>{q.answer}</span> : 'Go ahead.'}</p>}</li>)}</ul></section>;
}
