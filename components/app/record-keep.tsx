'use client';
import { useState } from 'react';
import { Button, Card, ConfirmDialog } from '../ui';
import { post, RequestError } from '../../lib/ui/api';

export function ContractFinish({ base, clientId, hasContract, finished, onDone }: { base: string; clientId: string; hasContract: boolean; finished: boolean; onDone: () => void }) {
  const [busy, setBusy] = useState<'finish' | 'clear' | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [ask, setAsk] = useState<boolean | null>(null);
  if (!hasContract && !finished) return null;
  async function run(finish: boolean) {
    setBusy(finish ? 'finish' : 'clear'); setError('');
    try { const saved = await post<{ reply: string }>(`${base}/clients/${clientId}/contract`, { finish }); setNotice(saved.reply); onDone(); }
    catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(null); setAsk(null); }
  }
  return <Card className="stack contract-finish"><h2>Maintenance contract</h2>
    {finished ? <p>The contract is finished. Past jobs stay covered by contract.</p> : <div className="row"><Button busy={busy === 'finish'} onClick={() => setAsk(true)}>Finish the contract</Button><Button variant="secondary" busy={busy === 'clear'} onClick={() => setAsk(false)}>Clear the contract</Button></div>}
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
    <ConfirmDialog open={ask !== null} title={ask ? 'Finish this contract?' : 'Clear the contract fields?'} confirmLabel="Yes" busy={!!busy} error={error} onClose={() => setAsk(null)} onConfirm={() => { if (ask !== null) void run(ask); }}><p>{ask ? 'New jobs will not be covered. Past jobs stay covered by contract.' : 'This works only when no job is covered by the contract.'}</p></ConfirmDialog>
  </Card>;
}

export function PartsKeep({ base, orders, onDone }: { base: string; orders: { id: string; cobalt_ref: string; work_order_title: string }[]; onDone: () => void }) {
  const [busy, setBusy] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState('');
  if (!orders.length) return null;
  return <Card className="stack parts-keep"><h2>Close a parts order</h2>
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{orders.map(order => <li key={order.id} className="row" style={{ minWidth: 0 }}>
      <span data-no-translate>{order.work_order_title}</span>
      <Button variant="secondary" busy={busy === order.id} onClick={() => void (async () => {
        setBusy(order.id); setError('');
        try { const saved = await post<{ reply: string }>(`${base}/orders/${order.id}`, {}); setNotice(saved.reply); onDone(); }
        catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
        finally { setBusy(''); }
      })()}>Close this order</Button>
    </li>)}</ul>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </Card>;
}
