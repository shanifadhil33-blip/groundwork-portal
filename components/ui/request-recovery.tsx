'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './button';
import { requestErrorCopy } from '../../lib/ui/request-errors';
/** Persistent recovery for background requests and mutation failures, preserving drafts. */
export function RequestRecovery() {
  const [status,setStatus]=useState<number|null>(null);
  useEffect(()=>{const receive=(event:Event)=>setStatus((event as CustomEvent<number>).detail);window.addEventListener('groundwork-request-error',receive);return()=>window.removeEventListener('groundwork-request-error',receive);},[]);
  if(status===null)return null;
  return <aside className="request-recovery card stack compact" role="alert"><p>{requestErrorCopy(status)}</p><small>Your inputs are still here. Try the action again when you’re ready.</small><div className="row"><Button variant="secondary" onClick={()=>{setStatus(null);window.dispatchEvent(new Event('groundwork-retry-resources'));}}>Try again</Button><Link className="button secondary" href="/">Back to home</Link>{status===403&&<Link className="button secondary" href="/dashboard">Go to dashboard</Link>}{status===429&&<Link className="button secondary" href="/sign-in">Sign in</Link>}<Button variant="ghost" onClick={()=>setStatus(null)}>Dismiss</Button></div></aside>;
}
