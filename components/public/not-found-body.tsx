'use client';
import { useEffect, useState } from 'react';
import { PublicHeader } from './chrome';
import { PageError } from '../ui/page-error';
import { Translator } from '../app/translator';
// Signed in people see this screen in their own language (Oct 21: it stayed English in Arabic).
// Client-resolved session so the root not-found boundary never forces static pages to render dynamically.
export function NotFoundBody() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { let active = true; void fetch('/api/session', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(session => { if (active) setSignedIn(session?.signedIn === true); }).catch(() => {}); return () => { active = false; }; }, []);
  return <><PublicHeader signedIn={signedIn} /><main><PageError title="We couldn’t open that page." message="The address may have changed, or you may not have access." home={signedIn ? '/dashboard' : '/'} homeLabel={signedIn ? 'Go to dashboard' : 'Back to home'} brand={false} /></main>{signedIn && <Translator />}</>;
}
