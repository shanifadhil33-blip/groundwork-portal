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
  const card = (persona: typeof personas[number], big: boolean) => <button key={persona.key} type="button" className={`persona-card ${big ? 'big' : ''}`} disabled={!!busy} aria-busy={busy === persona.key} onClick={() => start(persona.key)}>
    <span className="persona-top"><span className="avatar" aria-hidden="true" data-letter={persona.name[0]} /><span className="persona-who"><strong data-no-translate>{persona.name}</strong><span>{persona.role}</span></span>{persona.key === 'imran' && <Badge tone="info">Start here</Badge>}</span>
    <span className="persona-can">{persona.detail}</span>
    <span className="persona-action" role={busy === persona.key ? 'status' : undefined}>{busy === persona.key ? <><LoaderCircle className="spinner" aria-hidden="true" />Opening the demo</> : <>Continue as <span data-no-translate>{persona.name}</span><ArrowRight className="directional-icon" aria-hidden="true" /></>}</span>
  </button>;
  const first = ['imran', 'ravi', 'pranav'];
  return <>
    <div className="persona-grid">{personas.filter(p => first.includes(p.key)).sort((a, b) => first.indexOf(a.key) - first.indexOf(b.key)).map(p => card(p, true))}</div>
    <details className="more-people"><summary>More people</summary><div className="persona-grid">{personas.filter(p => !first.includes(p.key)).map(p => card(p, false))}</div></details>
    {error && <ErrorState message={error} retry={() => start(last)} />}
    <p className="privacy-note">Each visitor gets a private copy of the sample company. It is cleared after 6 hours. Real accounts never see demo data.</p>
  </>;
}
