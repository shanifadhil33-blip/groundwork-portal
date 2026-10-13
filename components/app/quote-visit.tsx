'use client';
import { useState } from 'react';
import { Badge, Button, Card, Dialog, LocalTime, useToast } from '../ui';
import { post, RequestError } from '../../lib/ui/api';

type Job = { id: string; status: string; scheduled_for: string | null; quote_amount?: string | number | null; quote_note?: string | null; quote_status?: string | null; visit_confirmed_for?: string | null };
const money = (v: string | number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(Number(v));
const quoteWord: Record<string, string> = { pending: 'Waiting for the client', approved: 'Approved', declined: 'Declined' };

/** Price and visit time on one job. The office sends a price; the client approves or declines it and confirms the visit time. */
export function QuoteVisit({ o, base, client, office, currency, reload, section = 'all' }: { section?: 'all' | 'visits' | 'costs'; o: Job; base: string; client: boolean; office: boolean; currency: string; reload: () => void }) {
  const toast = useToast(), [busy, setBusy] = useState(''), [open, setOpen] = useState(false), [amount, setAmount] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('');
  const closed = o.status === 'done' || o.status === 'cancelled';
  const confirmed = !!o.scheduled_for && !!o.visit_confirmed_for && new Date(o.visit_confirmed_for).getTime() === new Date(o.scheduled_for).getTime();
  const act = async (key: string, path: string, body: unknown, done: string) => { setBusy(key); try { await post(`${base}/work-orders/${o.id}/${path}`, body); toast(done); reload(); } catch (e) { toast(e instanceof RequestError ? e.message : 'That did not save. Try again.'); } finally { setBusy(''); } };
  async function send() { const n = Number(amount); if (!amount.trim() || !Number.isFinite(n) || n < 0) { setError('Type the price as a number.'); return; } setError(''); await act('send', 'quote', { amount: n, note: note.trim() || undefined }, 'Price sent to the client.'); setOpen(false); }
  return <>{section !== 'costs' && <Card className="stack compact visits-panel"><h2>Visits</h2>    {o.scheduled_for && <div className="row"><span className="small">Visit: <LocalTime value={o.scheduled_for} /></span>{confirmed ? <Badge tone="success">Confirmed by the client</Badge> : client && !closed ? <Button size="sm" busy={busy === 'visit'} disabled={!!busy} onClick={() => void act('visit', 'visit', {}, 'Visit time confirmed.')}>Confirm this time</Button> : <span className="small muted">Not confirmed yet</span>}</div>}{!o.scheduled_for&&<p>No visit scheduled.</p>}</Card>}{section !== 'visits' && <Card className="stack compact quote-visit costs-panel"><h2>Costs</h2>
    {o.quote_status ? <div className="stack compact"><div className="row"><strong>{money(o.quote_amount ?? 0, currency)}</strong><Badge tone={o.quote_status === 'approved' ? 'success' : o.quote_status === 'declined' ? 'danger' : undefined}>{client && o.quote_status === 'pending' ? 'Needs your answer' : quoteWord[o.quote_status]}</Badge></div>{o.quote_note && <p className="small preserve">{o.quote_note}</p>}
      {client && o.quote_status === 'pending' && !closed && <div className="row"><Button busy={busy === 'yes'} disabled={!!busy} onClick={() => void act('yes', 'quote/decision', { decision: 'approved' }, 'Price approved. The team can go ahead.')}>Approve price</Button><Button variant="secondary" busy={busy === 'no'} disabled={!!busy} onClick={() => void act('no', 'quote/decision', { decision: 'declined' }, 'Price declined. The team will be in touch.')}>Decline</Button></div>}</div>
      : <p className="small muted">{client ? 'No price yet.' : 'No price sent yet.'}</p>}
    {office && !closed && o.quote_status !== 'approved' && <div className="row"><Button variant="secondary" onClick={() => { setAmount(''); setNote(''); setError(''); setOpen(true); }}>{o.quote_status ? 'Send a new price' : 'Send price'}</Button></div>}

    <Dialog open={open} onClose={() => setOpen(false)} busy={busy === 'send'} title="Send price" footer={<><Button variant="secondary" disabled={busy === 'send'} onClick={() => setOpen(false)}>Cancel</Button><Button busy={busy === 'send'} onClick={() => void send()}>Send</Button></>}>
      <div className="stack compact"><label className="field"><span>Price ({currency})</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <label className="field"><span>What it covers</span><textarea rows={3} maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label>
        {error && <p className="inline-error" role="alert">{error}</p>}</div></Dialog>
  </Card>}</>;
}
