'use client';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { post, RequestError } from '../../../../lib/ui/api';
import { BackLink } from '../../../../components/public/chrome';
import { Button, Card, PageSkeleton } from '../../../../components/ui';
import { useApp } from '../../../../components/app/context';
function Accept() {
  const params = useSearchParams(), token = params.get('token'), { me, member } = useApp();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  return <div className="page narrow"><BackLink href={member ? (member.role === 'client' ? '/home' : '/dashboard') : '/onboarding'} label={member ? 'Home' : 'Workspace setup'} /><Card className="stack"><h1>Join a workspace.</h1><p>You’re signed in as {me.user.email}. Use the Google account that received the invite.</p>{!token ? <p className="inline-error">This invite is unavailable. Ask the workspace admin for a new link.</p> : <Button busy={busy} busyLabel="Accepting invite…" onClick={async () => { if (busy) return; setBusy(true); setError(null); try { await post('/api/invites/accept', { token }); window.location.replace('/dashboard'); } catch (e) { setError(e instanceof RequestError && e.status === 404 ? 'We couldn’t find that invite, or you don’t have access. Check that you’re using the invited account.' : e instanceof RequestError && e.status === 409 ? 'This invite is no longer available. Ask the workspace admin for a new link.' : 'We couldn’t accept the invite. Please try again.'); setBusy(false); } }}>Accept invite</Button>}{error && <p className="inline-error" role="alert">{error}</p>}</Card></div>;
}
export default function Page() { return <Suspense fallback={<PageSkeleton />}><Accept /></Suspense>; }
