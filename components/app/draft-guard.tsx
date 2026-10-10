'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Dialog } from '../ui';
export function guardedAction(action: () => void) { const event = new CustomEvent('groundwork:navigate', { cancelable: true, detail: action }); if (window.dispatchEvent(event)) action(); }
export function DraftGuard({ dirty, onDiscard }: { dirty: boolean; onDiscard?: () => void }) {
  const router = useRouter(), [pending, setPending] = useState<(() => void) | null>(null), bypass=useRef(false);
  useEffect(()=>{ if(!dirty){bypass.current=false;return;}bypass.current=false;let restoring = false;const protectedUrl=location.href;
    // A same-URL history entry keeps the editor mounted while a Back press is confirmed.
    if(!history.state?.groundworkDraftGuard)history.pushState({...history.state,groundworkDraftGuard:true},'',protectedUrl);
    const unload=(event:BeforeUnloadEvent)=>{ if(!bypass.current) { event.preventDefault(); event.returnValue=''; } };
    const click=(event:MouseEvent)=>{const anchor=(event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]'); if(!anchor || event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || anchor.target==='_blank' || anchor.href===location.href || anchor.getAttribute('href')?.startsWith('#')) return; if(bypass.current) return; event.preventDefault();event.stopPropagation();setPending(()=>()=>router.replace(anchor.href));};
    const navigate=(event:Event)=>{if(bypass.current)return;event.preventDefault();setPending(()=>(event as CustomEvent<()=>void>).detail);};
    const back=()=>{if(bypass.current)return;if(restoring){restoring=false;return;}restoring=true;history.forward();setPending(()=>()=>history.go(-2));};
    document.addEventListener('click',click,true);window.addEventListener('beforeunload',unload);window.addEventListener('popstate',back,true);window.addEventListener('groundwork:navigate',navigate);
    return ()=>{document.removeEventListener('click',click,true);window.removeEventListener('beforeunload',unload);window.removeEventListener('popstate',back,true);window.removeEventListener('groundwork:navigate',navigate);};
  },[dirty,router]);
  return <Dialog open={!!pending} onClose={()=>setPending(null)} title="Discard unsaved changes?" footer={<><Button variant="secondary" onClick={()=>setPending(null)}>Keep editing</Button><Button variant="danger" onClick={()=>{bypass.current=true;onDiscard?.();const action=pending;setPending(null);action?.();}}>Discard</Button></>}><p>Your unsaved changes will be lost.</p></Dialog>;
}
