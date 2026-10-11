'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { post, RequestError } from '../../lib/ui/api';
import { homeForPersona } from '../../lib/ui/helpers';
import { Badge, ErrorState } from '../ui/states';
export const personas = [{ key: 'dana', name: 'Dana', role: 'Admin', company: 'Ridgeline Facility Services', detail: 'Manage the workspace and coordinate work across all clients.' }, { key: 'sam', name: 'Sam', role: 'Staff', company: 'Ridgeline Facility Services', detail: 'Coordinate work orders and review incoming spreadsheet rows.' }, { key: 'priya', name: 'Priya', role: 'Client', company: 'Harbor & Pine Coworking', detail: 'See requests and updates for Harbor & Pine only.' }, { key: 'omar', name: 'Omar', role: 'Client', company: 'Northgate Self Storage', detail: 'See requests and updates for Northgate only.' }] as const;
export function DemoPicker() {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [last, setLast] = useState('dana');
  async function start(persona: string) { if (busy) return; setBusy(persona); setLast(persona); setError(null); try { await post('/api/demo/start', { persona }); window.location.replace(homeForPersona(persona)); } catch (e) { setError(e instanceof RequestError && e.status === 429 ? 'The demo is busy or you’ve reached the hourly limit. Please try again later.' : 'We couldn’t create your sandbox. Please try again.'); setBusy(null); } }
  return <><div className="persona-grid">{personas.map(persona => <button key={persona.key} type="button" className="persona-card" disabled={!!busy} aria-busy={busy === persona.key} onClick={() => start(persona.key)}><div className="persona-top"><span className="avatar" aria-hidden="true">{persona.name[0]}</span><Badge>{persona.role}</Badge></div><div><strong>{persona.name}</strong><p>{persona.company}</p></div><p>{persona.detail}</p><span className="persona-action" role={busy === persona.key ? 'status' : undefined}>{busy === persona.key ? <><LoaderCircle className="spinner" size={16} />Creating your sandbox…</> : <>Continue as {persona.name}<ArrowRight size={16} /></>}</span></button>)}</div>{error && <><ErrorState message={error} retry={() => start(last)} /><Link href="/sign-in" className="button secondary">Sign in</Link></>}<p className="privacy-note">Each visitor gets a private sandbox that expires after 24 hours and is cleared by daily cleanup. You can switch personas inside it. Real accounts never see demo data.</p></>;
}
