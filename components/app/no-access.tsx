import Link from 'next/link';
import { BackLink } from '../public/chrome';
export function NoAccess() { return <div className="not-found"><BackLink /><h1>This page is unavailable.</h1><p>We couldn’t find that, or you don’t have access.</p><Link href="/dashboard" className="link-button secondary">Go to your home</Link></div>; }
