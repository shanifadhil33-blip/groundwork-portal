'use client';
import { useApp } from '../../../components/app/context';
import { workspaceName } from '../../../lib/ui/timezones';
import { PageHeader } from '../../../components/ui/layout';
import { useState } from 'react';
import { request } from '../../../lib/ui/api';
import { BackLink } from '../../../components/public/chrome';
import { Button } from '../../../components/ui';
export default function Onboarding() {
  const {me}=useApp();
  const [name, setName] = useState(()=>workspaceName(me.user.name)), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [key] = useState(() => typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
  return <div className="page narrow"><BackLink /><section className="stack"><PageHeader><h1>Name your workspace.</h1></PageHeader><p>This is your company’s space for work orders and client collaboration. It starts empty, with only the data you add.</p><form className="stack" onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(null); try { await request('/api/workspaces', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ name, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }) }); window.location.replace('/dashboard'); } catch { setError('We couldn’t create your workspace. Your name is still here; please try again.'); setBusy(false); } }}><div className="form-field"><label htmlFor="workspace-name">Workspace name</label><input id="workspace-name" value={name} onChange={event => setName(event.target.value)} maxLength={200} required autoComplete="organization" aria-describedby={error ? 'workspace-error' : undefined} /></div>{error && <p id="workspace-error" role="alert" className="inline-error">{error}</p>}<Button type="submit" busy={busy} busyLabel="Creating workspace…">Create workspace</Button></form></section></div>;
}
