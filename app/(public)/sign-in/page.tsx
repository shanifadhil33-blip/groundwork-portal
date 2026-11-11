import { redirect } from 'next/navigation';
import { getSessionUserId } from '../../../lib/auth';
import Link from 'next/link';
import { authErrorCopy } from '../../../lib/ui/auth-errors';
import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { SignInForm } from '../../../components/public/sign-in-form';
import { safeRedirect } from '../../../lib/ui/helpers';
import { me } from '../../../lib/services/workspaces';
import { navFor } from '../../../lib/ui/nav';
import { LeaveDemo } from '../../../components/public/leave-demo';
export const metadata: Metadata = { title: 'Sign in' };
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
 // A real account goes to its Home. Someone in the demo is asked first, never sent back into it (bug 17).
 const user=await getSessionUserId();
 if(user){const identity=await me(user).catch(()=>null),member=identity?.memberships[0],home=member?navFor(member).home:'/dashboard';
  if(identity?.user.is_demo)return <div className="auth-page"><BackLink href={home} label="Back"/><div className="card auth-card"><LeaveDemo name={(identity.user.name??'').split(' ')[0]} home={home}/></div></div>;
  redirect(home);}
 const query = await searchParams; const next = query.callbackUrl ?? query.redirect; const error = query.error, signedOut = query.signed_out === '1' && !error; return <div className="auth-page"><BackLink label="Back" /><div className="card auth-card">{signedOut && <p role="status" className="signed-out-note">You’re signed out.</p>}<h1>Sign in to Groundwork.</h1><p>Use your Google account. New here? After signing in, you’ll choose your country and add your company name.</p>{error && <p role="alert" className="inline-error"><strong>{authErrorCopy(error).title}.</strong> {authErrorCopy(error).message}</p>}<SignInForm redirectTo={safeRedirect(typeof next === 'string' ? next : undefined)} /><p className="small join-hint"><Link href="/join">Got a code from your admin? Sign in with a code</Link></p><p className="small">Just looking? <Link href="/demo" className="text-link">Try the demo.</Link></p><small className="muted">By continuing, you agree to the <Link href="/terms" className="text-link">Terms</Link>. Read how data is handled in <Link href="/privacy" className="text-link">Privacy</Link>.</small></div></div>; }
