import type { Metadata } from 'next';
import Link from 'next/link';
import { JoinForm } from '../../../components/public/join-form';
export const metadata: Metadata = { title: 'Sign in with a code', robots: { index: false } };
export default function Page() {
  return <div className="auth-page"><div className="card auth-card stack"><h1>Sign in with a code</h1><p>Type the 6 numbers your admin sent you.</p><JoinForm /><p className="small"><Link href="/sign-in">Sign in with Google instead</Link></p></div></div>;
}
