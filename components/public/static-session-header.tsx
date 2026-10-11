'use client';
import { useEffect } from 'react';
import { PublicHeader } from './chrome';
import { SESSION_HINT_KEY } from '../../lib/head-scripts';
export function StaticSessionHeader() {
  useEffect(()=>{
    let active=true;
    // An anonymous visit is expected here; it must not trigger session recovery.
    void fetch('/api/session',{cache:'no-store'}).then(response=>response.ok?response.json():null).then(session=>{
      if(!active)return;
      const state=session?.signedIn===true?'in':'out';
      document.documentElement.dataset.session=state;
      try{localStorage.setItem(SESSION_HINT_KEY,state);}catch{}
    }).catch(()=>{ if(active&&!document.documentElement.dataset.session)document.documentElement.dataset.session='out'; });
    return ()=>{active=false;};
  },[]);
  return <PublicHeader />;
}
