'use client';
import { DemoDecisionText } from './demo-decision-text';
import { useState } from 'react';
import { Button, Card } from '../ui';
import { post } from '../../lib/ui/api';
import { useResource } from './resource';
type Lesson = { id: string; body: string; reason: 'company' | 'money' | 'safety' | 'clients'; proposed_by_name: string };
const REASON = { company: 'For the whole company', money: 'About money', safety: 'About safety', clients: 'About clients' } as const;
/** LEARN12: high impact lessons wait here for an admin or owner yes. Shown only when one is waiting. */
export function LessonsWaiting({ base, onDecision }: { base: string; onDecision?: () => void }) {
 const r = useResource<{ data: Lesson[]; can_decide: boolean }>(`${base}/lessons`), [busy, setBusy] = useState<string | null>(null), [note, setNote] = useState('');
 const rows = r.data?.data ?? [];
 if (!r.data?.can_decide || !rows.length) return note ? <p role="status" className="small">{note}</p> : null;
 async function decide(id: string, yes: boolean) { setBusy(id); setNote(''); try { const x = await post<{ reply: string }>(`${base}/lessons/${id}`, { yes }); setNote(x.reply); await r.reload(); onDecision?.(); } catch { setNote('We couldn’t save that. Please try again.'); } finally { setBusy(null); } }
 return <Card className="stack lessons-waiting"><h2>Lessons waiting for your yes</h2><p className="small">The agent uses these only after you say yes.</p>
  <ul className="stack compact">{rows.map(l => <li key={l.id} className="stack compact lesson-row"><p><DemoDecisionText text={l.body}/></p><p className="small"><span data-no-translate>{l.proposed_by_name}</span> · <span>{REASON[l.reason]}</span></p>
   <div className="row"><Button busy={busy === l.id} disabled={!!busy} onClick={() => void decide(l.id, true)}>Yes, use it</Button><Button variant="secondary" disabled={!!busy} onClick={() => void decide(l.id, false)}>No</Button></div></li>)}</ul>
  {note && <p role="status" className="small">{note}</p>}</Card>;
}
