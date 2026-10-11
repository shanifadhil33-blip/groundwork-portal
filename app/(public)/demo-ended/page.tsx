import Link from 'next/link';
import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
export const metadata: Metadata = { title: 'This demo has ended' };
export default function Page() { return <div className="auth-page"><BackLink /><div className="card auth-card"><h1>This demo has ended</h1><p>Your private sandbox has expired or been cleared. Start a new demo to explore again.</p><Link className="button primary" href="/demo">Start a new demo</Link><Link className="button secondary" href="/">Back to home</Link></div></div>; }
