'use client';
import { useEffect, useState } from 'react';
import { PublicHeader } from './chrome';
export function StaticSessionHeader() {
  const [signedIn,setSignedIn]=useState(false);
  useEffect(()=>{
    let active=true;
    // An anonymous visit is expected here; it must not trigger session recovery.
    void fetch('/api/me',{cache:'no-store'}).then(response=>{if(active)setSignedIn(response.ok);}).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  return <PublicHeader signedIn={signedIn}/>;
}
