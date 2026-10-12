import type { Metadata } from 'next';
import { JoinForm } from '../../../../components/public/join-form';
export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <div className="auth-page"><div className="card auth-card stack"><h1>Welcome to Groundwork</h1><p>Tap the button to sign in on this phone.</p><JoinForm token={token} /></div></div>;
}
