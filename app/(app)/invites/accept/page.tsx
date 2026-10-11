'use client';
import { PageHeader } from '../../../../components/ui/layout';
import Link from 'next/link';
import { safeRedirect } from '../../../../lib/ui/helpers';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { post, RequestError } from '../../../../lib/ui/api';
import { BackLink } from '../../../../components/public/chrome';
import { Button, PageSkeleton } from '../../../../components/ui';
import { useApp } from '../../../../components/app/context';
function Accept() {
  const params = useSearchParams(), token = params.get('token'), { me, member } = useApp();
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  return <div className="page narrow"><BackLink href={member ? (member.role === 'client' ? '/home' : '/dashboard') : '/onboarding'} label={member ? 'Home' : 'Workspace setup'} /><section className="stack"><PageHeader><h1>Join a workspace.</h1></PageHeader><p>You’re signed in as {me.user.email}. Use the Google account that received the invite.</p>{!token ? <p className="inline-error">This invite is unavailable. Ask your admin for a new invite.</p> : <Button busy={busy} busyLabel="Accepting invite…" onClick={async () => { if (busy) return; setBusy(true); setError(null); try { await post('/api/invites/accept', { token }); window.location.replace('/dashboard'); } catch (e) { setError(e instanceof RequestError && e.status === 422 ? 'This invite link is invalid. Ask your admin for a new invite.' : e instanceof RequestError && e.code === 'invite_expired' ? 'This invite has expired. Ask your admin for a new invite.' : e instanceof RequestError && e.code === 'invite_used' ? 'This invite has already been used. Go to your dashboard or ask your admin for a new invite.' : e instanceof RequestError && e.status === 404 ? 'We couldn’t find that invite, or you don’t have access. Sign in with the invited account, or ask your admin for a new invite.' : e instanceof RequestError && e.status === 409 ? 'This invite is no longer available. Ask your admin for a new invite.' : 'We couldn’t accept the invite. Please try again.'); setBusy(false); } }}>Accept invite</Button>}{error && <p className="inline-error" role="alert">{error}</p>}<div className="row"><Link href={member?.role === "client" ? "/home" : "/dashboard"} className="button secondary">Go to dashboard</Link><Link href={"/sign-in?callbackUrl="+encodeURIComponent(safeRedirect("/invites/accept"+(token?"?token="+encodeURIComponent(token):"")))} className="button secondary">Sign in with a different account</Link><Link href="/" className="button secondary">Back to home</Link></div></section></div>;
}
export default function Page() { return <Suspense fallback={<PageSkeleton />}><Accept /></Suspense>; }
