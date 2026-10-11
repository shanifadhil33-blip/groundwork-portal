
'use client';
import Link from 'next/link';
import { useContext } from 'react';
import { AppContext } from './context';
export function NoAccess() { const member=useContext(AppContext)?.member;const home=member?.role==='client'?'/home':'/dashboard';return <div className="page stack error-page"><Link className="back-link" href={home}>← Home</Link><h1>This page is unavailable.</h1><p>We couldn’t find that, or you don’t have access.</p><Link href={home} className="button secondary">Go to dashboard</Link><Link href="/" className="button secondary">Back to home</Link></div>; }
