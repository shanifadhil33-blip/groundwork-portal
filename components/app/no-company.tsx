'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Translated } from './app-words';
import { useApp } from './context';
import { PageHeader } from '../ui/layout';
import { Button, Card, Dropdown } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { countryOptions } from '../../lib/countries/rules';

/** A signed in person with no company sees only this: create one, or join with an invite. */
export function NoCompany() {
  const { me, reload } = useApp();
  const [name, setName] = useState(''), [country, setCountry] = useState('AE');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [fieldError, setFieldError] = useState('');
  async function create() {
    if (busy) return;
    if (!name.trim()) { setFieldError('Enter your company name.'); return; }
    setBusy(true); setError(''); setFieldError('');
    try {
      await post('/api/workspaces', { name: name.trim(), country });
      await reload();
      window.location.replace('/dashboard');
    } catch (e) {
      if (e instanceof RequestError && e.fields?.name) setFieldError(e.fields.name[0]);
      else setError(e instanceof RequestError ? e.message : 'We couldn’t create your company. Please try again.');
      setBusy(false);
    }
  }
  const first = (me.user.name ?? '').split(' ')[0];
  return (
    <Translated>
      <div className="page no-company">
        <PageHeader><div className="page-title"><h1><span>Welcome</span>{first && <>, <bdi data-no-translate>{first}</bdi></>}</h1><p>You are not part of a company yet. Create yours, or join with an invite.</p></div></PageHeader>
        <Card>
          <form className="stack" onSubmit={event => { event.preventDefault(); void create(); }}>
            <h2>Create your company</h2>
            <div className="form-field"><label htmlFor="company-name">Company name</label><input id="company-name" autoComplete="organization" maxLength={200} value={name} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'company-name-error' : undefined} onChange={event => { setName(event.target.value); setFieldError(''); }} />{fieldError && <p id="company-name-error" className="inline-error">{fieldError}</p>}</div>
            <div className="form-field"><label htmlFor="company-country">Country</label><Dropdown id="company-country" label="Country" value={country} options={countryOptions()} onChange={setCountry} width={320} /><p className="field-hint">Sets address fields, phone format and currency.</p></div>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <Button type="submit" size="lg" busy={busy} busyLabel="Creating">Create company</Button>
          </form>
        </Card>
        <Card className="stack compact">
          <h2>Join a company</h2>
          <p>Ask your manager for an invite link. Open it on this phone and you will join straight away.</p>
          <div className="row"><Link className="button secondary md" href="/join">I have a sign in code</Link><Link className="button ghost md" href="/find-company">Find your company</Link></div>
        </Card>
      </div>
    </Translated>
  );
}
