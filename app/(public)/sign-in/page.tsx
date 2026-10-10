import Link from 'next/link';
import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { SignInForm } from '../../../components/public/sign-in-form';
import { safeRedirect } from '../../../lib/ui/helpers';
export const metadata: Metadata = { title: 'Sign in' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) { const query = await searchParams; const next = query.callbackUrl ?? query.redirect; const error = query.error; return <div className="auth-page"><BackLink /><div className="card auth-card"><span className="eyebrow">Welcome to Groundwork</span><h1>Sign in to your workspace.</h1><p>Use your Google account. New here? You’ll name your workspace after signing in.</p>{error && <p role="alert" className="inline-error">{error === 'AccessDenied' ? 'Sign-in wasn’t approved. Try another Google account or explore the demo.' : 'We couldn’t complete your sign-in. Please try again.'}</p>}<SignInForm redirectTo={safeRedirect(typeof next === 'string' ? next : undefined)} /><Link href="/demo" className="text-link">Try the demo instead</Link><small className="muted">By continuing, you agree to the <Link href="/terms" className="text-link">Terms</Link>. Read how data is handled in <Link href="/privacy" className="text-link">Privacy</Link>.</small></div></div>; }
