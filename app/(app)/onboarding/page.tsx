'use client';
import { useApp } from '../../../components/app/context';
import { workspaceName } from '../../../lib/ui/timezones';
import { PageHeader } from '../../../components/ui/layout';
import { useState } from 'react';
import { request, RequestError } from '../../../lib/ui/api';
import { BackLink } from '../../../components/public/chrome';
import { Button, Dropdown } from '../../../components/ui';
import { an, countryName, countryOptions, currencyFor, guessCountry, phoneHint, regionField } from '../../../lib/countries/rules';

const STEPS = ['Country', 'Region', 'Organization'] as const;

/**
 * First run for a new company: where it works (country, then that country's own region level), then its name.
 * The country sets the address, phone and currency rules across the whole app; all of it can be changed
 * later in Settings. Back keeps every value.
 */
export default function Onboarding() {
  const { me } = useApp();
  const zone = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone : undefined;
  const [step, setStep] = useState(0), [country, setCountry] = useState(() => guessCountry(zone)), [region, setRegion] = useState('');
  const [name, setName] = useState(() => workspaceName(me.user.name)), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [nameError, setNameError] = useState('');
  const [key] = useState(() => typeof crypto !== 'undefined' ? crypto.randomUUID() : '');
  const level = regionField(country);
  const regionLabel = level.label.toLowerCase();
  function pickCountry(next: string) { if (next !== country) setRegion(''); setCountry(next); }
  async function create() {
    if (busy) return;
    if (!name.trim()) { setNameError('Enter your organization name.'); document.getElementById('workspace-name')?.focus(); return; }
    setBusy(true); setError(null);
    try {
      await request('/api/workspaces', { method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify({ name: name.trim(), timezone: zone, country, region: region || null }) });
      window.location.replace('/dashboard');
    } catch (e) {
      setError(e instanceof RequestError && e.fields?.region ? `Choose ${an(regionLabel)} ${regionLabel} from the list, or skip it.` : 'We couldn’t create your workspace. Your answers are still here; please try again.');
      setBusy(false);
    }
  }
  const next = () => setStep(s => Math.min(STEPS.length - 1, s + 1)), back = () => setStep(s => Math.max(0, s - 1));
  return <div className="page narrow"><BackLink /><section className="stack">
    <div className="stack compact">
      <p className="small muted" aria-live="polite">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      <ol className="onboarding-steps" aria-hidden="true">{STEPS.map((s, i) => <li key={s} className={i <= step ? 'done' : ''} />)}</ol>
    </div>
    <form className="stack" noValidate onSubmit={event => { event.preventDefault(); if (step < STEPS.length - 1) next(); else void create(); }}>
      {step === 0 && <>
        <PageHeader><h1>Where does your company work?</h1></PageHeader>
        <p>Your country sets the address fields, phone format and currency across Groundwork. You can change it later in Settings.</p>
        <div className="form-field"><label htmlFor="workspace-country">Country</label>
          <Dropdown id="workspace-country" label="Country" width={340} value={country} options={countryOptions()} onChange={pickCountry} />
        </div>
      </>}
      {step === 1 && <>
        <PageHeader><h1>Which {regionLabel}?</h1></PageHeader>
        <p>Where your company is based in {countryName(country)}. Optional: clients and sites each get their own {regionLabel}.</p>
        <div className="form-field"><label htmlFor="workspace-region">{level.label}<span className="optional"> (optional)</span></label>
          {level.options
            ? <Dropdown id="workspace-region" label={level.label} width={340} value={region} options={[{ value: '', label: `Choose ${an(regionLabel)} ${regionLabel}` }, ...level.options.map(o => ({ value: o, label: o }))]} onChange={setRegion} />
            : <input id="workspace-region" value={region} maxLength={120} autoComplete="address-level1" onChange={e => setRegion(e.target.value)} />}
        </div>
      </>}
      {step === 2 && <>
        <PageHeader><h1>Name your organization.</h1></PageHeader>
        <p>This is your company’s space for work orders and client collaboration. It starts empty, with only the data you add.</p>
        <div className="form-field"><label htmlFor="workspace-name">Organization name</label>
          <input id="workspace-name" value={name} onChange={e => { setName(e.target.value); setNameError(''); }} maxLength={200} required autoComplete="organization" aria-invalid={!!nameError} aria-describedby={nameError ? 'workspace-name-error' : error ? 'workspace-error' : undefined} />
          {nameError && <p id="workspace-name-error" className="inline-error" role="alert">{nameError}</p>}
        </div>
        <dl className="onboarding-review" aria-label="Your workspace">
          <dt>Country</dt><dd>{countryName(country)}</dd>
          <dt>{level.label}</dt><dd>{region || 'Not set'}</dd>
          <dt>Phone format</dt><dd>{phoneHint(country)}</dd>
          <dt>Currency</dt><dd>{currencyFor(country)}</dd>
        </dl>
      </>}
      {error && <p id="workspace-error" role="alert" className="inline-error">{error}</p>}
      <div className="onboarding-actions">
        {step > 0 ? <Button type="button" variant="secondary" disabled={busy} onClick={back}>Back</Button> : <span />}
        <div className="row">
          {step === 1 && !region && <Button type="button" variant="ghost" onClick={next}>Skip for now</Button>}
          {step < STEPS.length - 1 ? <Button type="submit">Continue</Button> : <Button type="submit" busy={busy} busyLabel="Creating workspace…">Create workspace</Button>}
        </div>
      </div>
    </form>
  </section></div>;
}
