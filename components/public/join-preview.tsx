'use client';
import { useState } from 'react';
import { Button } from '../ui';
import { PRACTICE_CODE, PRACTICE_NOTICE } from '../../lib/identity-rehearsal';

/** Local only. Never calls redemption, changes a cookie, or navigates into a session. */
export function JoinPreview() {
  const [code, setCode] = useState(''), [result, setResult] = useState<'success' | 'error' | null>(null);
  return <div className="stack"><p>{PRACTICE_NOTICE}</p><p data-no-translate>{PRACTICE_CODE}</p><form className="stack" onSubmit={e => { e.preventDefault(); setResult(code.trim().toUpperCase() === PRACTICE_CODE ? 'success' : 'error'); }}>
    <label className="form-field">Code<input value={code} maxLength={20} onChange={e => { setCode(e.target.value); setResult(null); }} autoComplete="off" /></label><Button type="submit">Sign in preview</Button>
    {result === 'success' && <p role="status">Practice sign in complete. You are still using the same account.</p>}
    {result === 'error' && <p role="alert" className="inline-error">That did not work. Please try again.</p>}
  </form></div>;
}
