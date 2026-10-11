'use client';
import { useEffect, useState } from 'react';
import { PublicHeader } from './chrome';
import { PageError } from '../ui/page-error';
// Client-resolved session so the root not-found boundary never forces static pages to render dynamically.
export function NotFoundBody() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { let active = true; void fetch('/api/me', { cache: 'no-store' }).then(r => { if (active) setSignedIn(r.ok); }).catch(() => {}); return () => { active = false; }; }, []);
  return <><PublicHeader signedIn={signedIn} /><main><PageError title="We couldn’t open that page." message="The address may have changed, or you may not have access." home={signedIn ? '/dashboard' : '/'} homeLabel={signedIn ? 'Go to dashboard' : 'Back to home'} /></main></>;
}
