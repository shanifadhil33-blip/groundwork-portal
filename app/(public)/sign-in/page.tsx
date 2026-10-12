import { redirect } from 'next/navigation';
import { getSessionUserId } from '../../../lib/auth';
import Link from 'next/link';
import { authErrorCopy } from '../../../lib/ui/auth-errors';
import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { SignInForm } from '../../../components/public/sign-in-form';
import { safeRedirect } from '../../../lib/ui/helpers';
export const metadata: Metadata = { title: 'Sign in' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { if(await getSessionUserId())redirect('/dashboard'); const query = await searchParams; const next = query.callbackUrl ?? query.redirect; const error = query.error, signedOut = query.signed_out === '1' && !error; return <div className="auth-page"><BackLink /><div className="card auth-card">{signedOut && <p role="status" className="signed-out-note">You’re signed out.</p>}<h1>Sign in to your workspace.</h1><p>Use your Google account. New here? After signing in, you’ll choose your country and add your company name.</p>{error && <p role="alert" className="inline-error"><strong>{authErrorCopy(error).title}.</strong> {authErrorCopy(error).message}</p>}<SignInForm redirectTo={safeRedirect(typeof next === 'string' ? next : undefined)} /><Link href="/demo" className="text-link">Try the demo instead</Link><small className="muted">By continuing, you agree to the <Link href="/terms" className="text-link">Terms</Link>. Read how data is handled in <Link href="/privacy" className="text-link">Privacy</Link>.</small></div></div>; }
