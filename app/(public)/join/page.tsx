import type { Metadata } from 'next';
import Link from 'next/link';
import { JoinPreview } from '../../../components/public/join-preview';
import { JoinForm } from '../../../components/public/join-form';
export const metadata: Metadata = { title: 'Sign in with a code', robots: { index: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const preview = (await searchParams).preview === 'worker';
  if (preview) return <div className="auth-page"><div className="card auth-card stack"><h1>Sign in preview</h1><JoinPreview /><Link href="/team">Team</Link></div></div>;
  return <div className="auth-page"><div className="card auth-card stack"><h1>Sign in with a code</h1><p>Type the 6 numbers your admin sent you.</p><JoinForm /><Link className="text-link" href="/privacy">Read the privacy notice</Link><p className="small"><Link href="/sign-in">Sign in with Google instead</Link></p></div></div>;
}
