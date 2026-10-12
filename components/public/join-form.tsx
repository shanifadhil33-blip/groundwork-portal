'use client';
import { useState } from 'react';
import { LogIn } from 'lucide-react';
import { Button } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { rememberSession } from '../../lib/head-scripts';

/** One big button. A link only signs in when tapped, so WhatsApp previews never use it up. */
export function JoinForm({ token }: { token?: string }) {
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function go() {
    if (!token && code.replace(/\D/g, '').length !== 6) { setError('Type the 6 numbers.'); return; }
    setBusy(true); setError('');
    try { const r = await post<{ home: string }>('/api/field-signin', token ? { token } : { code }); rememberSession('in'); window.location.replace(r.home); }
    catch (e) { setError(e instanceof RequestError && e.status !== 0 ? e.message : 'That did not work. Please try again.'); setBusy(false); }
  }
  return <form className="stack join-form" noValidate onSubmit={e => { e.preventDefault(); void go(); }}>
    {!token && <><label htmlFor="join-code">Code</label><input id="join-code" className="join-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} placeholder="000000" value={code} onChange={e => setCode(e.target.value.replace(/[^\d ]/g, ''))} aria-invalid={!!error} autoFocus /></>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Button type="submit" className="big-action" busy={busy} disabled={busy}><LogIn size={20} aria-hidden="true" />Sign in</Button>
  </form>;
}
