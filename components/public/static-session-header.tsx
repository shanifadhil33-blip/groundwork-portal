'use client';
import { useEffect } from 'react';
import { PublicHeader } from './chrome';
import { rememberSession } from '../../lib/head-scripts';
export function StaticSessionHeader() {
  useEffect(()=>{
    let active=true;
    // An anonymous visit is expected here; it must not trigger session recovery.
    void fetch('/api/session',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(session=>{
      if(!active)return;
      rememberSession(session?.signedIn===true?'in':'out');
    }).catch(()=>{});
    return ()=>{active=false;};
  },[]);
  return <PublicHeader />;
}
