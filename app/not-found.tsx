import { BackLink } from '../components/public/chrome';
import Link from 'next/link';
import { SessionHeader } from '../components/public/session-header';
export default async function NotFound() { return <>{await SessionHeader()}<main className="not-found"><BackLink /><h1>We couldn’t open that page.</h1><p>The address may have changed, or you may not have access.</p><Link href="/dashboard" className="button primary">Try again</Link><Link href="/dashboard" className="button secondary">Go to dashboard</Link><Link href="/" className="button secondary">Back to home</Link></main></>; }
