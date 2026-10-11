
'use client';
import Link from 'next/link';
import { useContext } from 'react';
import { AppContext } from './context';
export function NoAccess() { const member=useContext(AppContext)?.member;const home=member?.role==='client'?'/home':'/dashboard';return <div className="page stack error-page">{member&&<Link className="back-link" href={home}>← Home</Link>}<h1>This page is unavailable.</h1><p>We couldn’t find that, or you don’t have access.</p><Link href={member?home:"/sign-in"} className="button secondary">{member?(member.role==='client'?'Go to requests':'Go to dashboard'):'Sign in'}</Link><Link href="/" className="button secondary">Back to home</Link></div>; }
