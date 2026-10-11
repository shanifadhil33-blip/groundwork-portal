import Link from 'next/link';
import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { safeRedirect } from '../../../lib/ui/helpers';
export const metadata: Metadata = { title: 'Your session ended' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const query = await searchParams;
  const callback = safeRedirect(typeof query.callbackUrl === 'string' ? query.callbackUrl : undefined);
  return <div className="auth-page"><BackLink /><div className="card auth-card"><h1>Your session ended</h1><p>Sign in again to continue where you left off.</p><Link className="button primary" href={'/sign-in?callbackUrl='+encodeURIComponent(callback)}>Sign in again</Link><Link className="button secondary" href="/">Back to home</Link><Link className="text-link" href="/demo">Start a new demo</Link></div></div>;
}
