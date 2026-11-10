'use client';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, LoaderCircle } from 'lucide-react';
import { postDemoStart, RequestError } from '../../lib/ui/api';
import { demoLanguage } from '../../lib/ui/demo-language';
import { homeForPersona } from '../../lib/ui/helpers';
import { Badge, ErrorState } from '../ui/states';
import { ROLE_CAN_DO, ROLE_NAME, type RoleGroup } from '../../lib/ui/nav';
const people = [
  { key: 'imran', name: 'Imran', group: 'owner', company: 'Ridgeline Facility Services' },
  { key: 'hassan', name: 'Hassan', group: 'admin', company: 'Ridgeline Facility Services' },
  { key: 'sam', name: 'Sam', group: 'supervisor', company: 'Ridgeline Facility Services' },
  { key: 'nabil', name: 'Nabil', group: 'office', company: 'Ridgeline Facility Services' },
  { key: 'ravi', name: 'Ravi', group: 'technician', company: 'Ridgeline Facility Services' },
  { key: 'pranav', name: 'Pranav', group: 'client_manager', company: 'Harbor and Pine Coworking' },
  { key: 'omar', name: 'Omar', group: 'client_manager', company: 'Northgate Self Storage' },
  { key: 'kevin', name: 'Kevin', group: 'client_staff', company: 'Harbor and Pine Coworking' },
  { key: 'faisal', name: 'Faisal', group: 'home_client', company: 'His own home' },
] as const satisfies readonly { key: string; name: string; group: RoleGroup; company: string }[];
export const personas = people.map(p => ({ ...p, role: ROLE_NAME[p.group], detail: ROLE_CAN_DO[p.group] }));
export function DemoPicker() {
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [last, setLast] = useState('imran');
  async function start(persona: string) { if (busy) return; setBusy(persona); setLast(persona); setError(null); try { await postDemoStart({ persona, language: demoLanguage() }); window.location.replace(homeForPersona(persona)); } catch (e) { setError(e instanceof RequestError && e.status === 429 ? 'Too many tries. Please wait a while and try again.' : 'We couldn’t open the demo. Please try again.'); setBusy(null); } }
  return <><div className="persona-grid">{personas.map(persona => <button key={persona.key} type="button" className="persona-card" disabled={!!busy} aria-busy={busy === persona.key} onClick={() => start(persona.key)}><div className="persona-top"><span className="avatar" aria-hidden="true">{persona.name[0]}</span><Badge>{persona.role}</Badge></div><div><strong>{persona.name}</strong><p>{persona.company}</p></div><p>{persona.detail}</p><span className="persona-action" role={busy === persona.key ? 'status' : undefined}>{busy === persona.key ? <><LoaderCircle className="spinner" size={16} />Creating your sandbox…</> : <>Continue as {persona.name}<ArrowRight className="directional-icon" size={16} /></>}</span></button>)}</div>{error && <><ErrorState message={error} retry={() => start(last)} /><Link href="/sign-in" className="button secondary">Sign in</Link></>}<p className="privacy-note">Each visitor gets a private sandbox that expires after 6 hours and is then cleared. You can switch personas inside it. Real accounts never see demo data.</p></>;
}
