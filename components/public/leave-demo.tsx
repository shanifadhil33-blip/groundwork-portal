'use client';
import Link from 'next/link';
import { useState } from 'react';
import { post } from '../../lib/ui/api';
import { rememberSession } from '../../lib/head-scripts';
import { Button } from '../ui/button';

/** Someone in the demo opened Sign in: offer to leave the demo first, never jump back into it. */
export function LeaveDemo({ name, home }: { name: string; home: string }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(false);
  async function leave() {
    setBusy(true); setError(false);
    try {
      await post('/api/auth/sign-out');
      document.cookie = 'groundwork-demo=0; Path=/; SameSite=Lax; Max-Age=0';
      sessionStorage.clear(); rememberSession('out');
      window.location.replace('/sign-in');
    } catch { setError(true); setBusy(false); }
  }
  return (
    <div className="stack compact">
      <h1>You are in the demo as <bdi data-no-translate>{name}</bdi>.</h1>
      <p>Sign in with your own account instead?</p>
      <div className="row">
        <Button busy={busy} busyLabel="Leaving the demo" onClick={leave}>Leave the demo and sign in</Button>
        <Link className="button secondary md" href={home}>Back to the demo</Link>
      </div>
      {error && <p className="inline-error" role="alert">We couldn’t leave the demo. Please try again.</p>}
    </div>
  );
}
