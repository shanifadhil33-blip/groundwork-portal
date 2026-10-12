'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from './button';
import { requestErrorCopy } from '../../lib/ui/request-errors';
/** Persistent recovery for background requests and mutation failures, preserving drafts. */
export function RequestRecovery() {
  const [status,setStatus]=useState<number|null>(null);
  useEffect(()=>{const receive=(event:Event)=>setStatus((event as CustomEvent<number>).detail),online=()=>{setStatus(null);window.dispatchEvent(new Event('groundwork-retry-resources'));};window.addEventListener('groundwork-request-error',receive);window.addEventListener('online',online);return()=>{window.removeEventListener('groundwork-request-error',receive);window.removeEventListener('online',online);};},[]);
  if(status===null)return null;
  return <aside className="request-recovery card stack compact" role="alert"><p>{requestErrorCopy(status)}</p><small>Nothing you typed is lost.</small><div className="row"><Button variant="secondary" onClick={()=>{setStatus(null);window.dispatchEvent(new Event('groundwork-retry-resources'));}}>Try again</Button>{status===429&&<Link className="button secondary" href="/sign-in">Sign in</Link>}<Button variant="ghost" onClick={()=>setStatus(null)}>Close</Button></div></aside>;
}
