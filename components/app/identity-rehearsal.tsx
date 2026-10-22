'use client';
import { useState } from 'react';
import { Badge, Button, ConfirmDialog, Dropdown, EmptyState, ErrorState, Skeleton } from '../ui';
import { useResource } from './resource';
import { post, RequestError } from '../../lib/ui/api';
import { PRACTICE_NOTICE, PRACTICE_EMAIL_HINT } from '../../lib/identity-rehearsal';
import { ROLES, roleHints, labelsFor, type Role } from '../../lib/roles';
import { useApp } from './context';
import type { Client } from '../../lib/ui/work-orders';

type Invite = { id: string; email: string; role: Role; client_id: string | null; client_kind: string; status: string };
function PracticeInviteForm({ base, clientId }: { base: string; clientId?: string }) {
  const { member, workspace } = useApp(), labels = labelsFor(workspace?.role_names);
  const invites = useResource<Invite[]>(`${base}/invites`), clients = useResource<Client[]>(clientId ? null : `${base}/clients`);
  const [email, setEmail] = useState(''), [role, setRole] = useState<Role>(clientId ? 'client' : 'staff'), [client, setClient] = useState(clientId ?? ''), [kind, setKind] = useState('manager');
  const [confirm, setConfirm] = useState(false), [revoke, setRevoke] = useState<Invite | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(false);
  const kinds = { manager: 'Facility manager', office: 'Facility staff', household: 'Household' };
  if (member?.role !== 'admin') return null;
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      if (revoke) await post(`${base}/invites/${revoke.id}/revoke`);
      else await post(`${base}/invites`, { email, role, ...(role === 'client' ? { client_id: client, client_kind: kind } : {}) });
      setResult(!revoke); setConfirm(false); setRevoke(null); await invites.reload();
    } catch (e) { setError(e instanceof RequestError ? e.message : 'That did not work. Please try again.'); }
    finally { setBusy(false); }
  }
  return <section className="stack"><h2>Invites</h2><p>{PRACTICE_NOTICE}</p><p>{PRACTICE_EMAIL_HINT}</p>
    <form className="stack" noValidate onSubmit={e => { e.preventDefault(); setError(''); setResult(false); if (!/^[^\s@]+@[^\s@]+\.example$/i.test(email.trim())) { setError(PRACTICE_EMAIL_HINT); return; } setConfirm(true); }}>
      <label className="form-field">Email<input type="email" maxLength={320} value={email} disabled={busy} onChange={e => setEmail(e.target.value)} /></label>
      {!clientId && <Dropdown label="Role" value={role} onChange={v => setRole(v as Role)} options={ROLES.map(value => ({ value, label: labels[value] }))} />}
      <p>{roleHints[role]}</p>
      {role === 'client' && <>{!clientId && (clients.error ? <ErrorState retry={clients.reload} /> : <Dropdown label="Client company" value={client} onChange={setClient} placeholder="Choose a client" options={(clients.data ?? []).map(c => ({ value: c.id, label: c.name }))} />)}
        <Dropdown label="Client type" value={kind} onChange={setKind} options={Object.entries(kinds).map(([value, label]) => ({ value, label }))} /><p>{kinds[kind as keyof typeof kinds]}</p></>}
      <Button type="submit" disabled={busy || role === 'client' && !client}>Create invite</Button>
    </form>
    {result && <p role="status">Practice invite created. It cannot grant access.</p>}
    {error && <p role="alert" className="inline-error">{error}</p>}
    {invites.loading ? <Skeleton className="skeleton-row" /> : invites.error ? <ErrorState retry={invites.reload} /> : (invites.data ?? []).filter(i => !clientId || i.client_id === clientId).map(i => <div className="site-row" key={i.id}><div><span data-no-translate>{i.email}</span><p>{labels[i.role]}{i.role === 'client' && <> · {kinds[i.client_kind as keyof typeof kinds]}</>}</p><Badge>{i.status === 'revoked' ? 'Revoked' : 'Pending'}</Badge></div>{i.status === 'pending' && <Button variant="secondary" disabled={busy} onClick={() => { setError(''); setRevoke(i); setResult(false); }}>Revoke invite</Button>}</div>)}
    {!invites.loading && !invites.error && !invites.data?.length && <EmptyState title="No invites yet" />}
    <ConfirmDialog open={confirm || !!revoke} onClose={() => { setConfirm(false); setRevoke(null); }} title={revoke ? 'Revoke invite?' : 'Create invite'} confirmLabel={revoke ? 'Revoke invite' : 'Create invite'} busy={busy} error={error} onConfirm={() => void save()}>{PRACTICE_NOTICE}<span data-no-translate>{revoke?.email ?? email}</span></ConfirmDialog>
  </section>;
}

export function PracticeInvites(props: { base: string; clientId?: string }) {
  const { me } = useApp();
  return <PracticeInviteForm key={`${me.user.id}:${props.base}:${props.clientId ?? ''}`} {...props} />;
}
