'use client';
import { usePhoneLayer } from '../../lib/ui/phone-back';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './button';
import { shouldDismissSheet } from '../../lib/ui/helpers';
const focusable = 'button:not(:disabled),a[href],input:not(:disabled),textarea:not(:disabled),[tabindex="0"]';
export function Dialog({ open, onClose, title, children, busy = false, sheet = false, presentation, footer, headerActions, dirty = false }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; busy?: boolean; sheet?: boolean; presentation?: 'drawer' | 'popover' | 'assistant'; footer?: ReactNode; headerActions?: ReactNode; dirty?: boolean }) {
  const [mounted, setMounted] = useState(false), [offset, setOffset] = useState(0), [dragging, setDragging] = useState(false), [closing, setClosing] = useState(false), [discard, setDiscard] = useState(false);
  const panel = useRef<HTMLDivElement>(null), drag = useRef({ start: 0, time: 0 }), closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleId = useId(), closeRef = useRef(onClose), busyRef = useRef(busy), dirtyRef=useRef(dirty);dirtyRef.current=dirty; closeRef.current = onClose; busyRef.current = busy;
  useEffect(() => { setMounted(true); return () => { if (closeTimer.current) clearTimeout(closeTimer.current); }; }, []);
  const close = (force = false) => { if (busyRef.current || closing) return;if(dirtyRef.current&&!force){setDiscard(true);return;} setClosing(true); closeTimer.current = setTimeout(() => { closeRef.current(); setClosing(false); setOffset(0); }, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180); };
  usePhoneLayer(open&&mounted,()=>{if(busyRef.current)return false;if(dirtyRef.current){setDiscard(v=>!v);return false;}closeRef.current();});
  useEffect(() => {
    if (!open || !mounted) return;
    setOffset(0); setClosing(false);setDiscard(false);
    const previous = document.activeElement as HTMLElement | null, oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const siblings = Array.from(document.body.children).filter(el => el !== panel.current?.parentElement && el instanceof HTMLElement && !el.matches('.toast-region')) as HTMLElement[];
    const oldInert = siblings.map(el => el.inert); siblings.forEach(el => { el.inert = true; });
    panel.current?.focus({ preventScroll: true });
    const top=()=>Array.from(document.querySelectorAll('[role="dialog"]')).at(-1)===panel.current;
    const key = (event: KeyboardEvent) => {
      if(!top())return;
      if (event.key === 'Escape') { if (document.querySelector('[data-menu-overlay]')) return; event.preventDefault(); if (!busyRef.current) close(); }
      if (event.key === 'Tab') {
        const items = [...Array.from(panel.current?.querySelectorAll<HTMLElement>(focusable) ?? []), ...Array.from(document.querySelectorAll<HTMLElement>('.toast-region button:not(:disabled)'))].filter(el => el.getClientRects().length);
        const first = items[0], last = items[items.length - 1];
        if (!first) { event.preventDefault(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || (!panel.current?.contains(document.activeElement) && !(document.activeElement as HTMLElement)?.closest('.toast-region')))) { event.preventDefault(); first.focus(); }
      }
    };
    const contain = (event: FocusEvent) => { if (top() && !panel.current?.contains(event.target as Node) && !(event.target as HTMLElement).closest('[data-menu-overlay],.toast-region')) panel.current?.focus({ preventScroll: true }); };
    document.addEventListener('keydown', key); document.addEventListener('focusin', contain);
    return () => { document.body.style.overflow = oldOverflow; siblings.forEach((el, i) => { el.inert = oldInert[i]; }); document.removeEventListener('keydown', key); document.removeEventListener('focusin', contain); previous?.focus({ preventScroll: true }); };
    // Lifetime follows the modal, handlers read latest state through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mounted]);
  const start = (event: PointerEvent<HTMLDivElement>) => { if ((event.target as HTMLElement).closest('button,a,input') || busy || !matchMedia('(max-width: 640px)').matches) return; drag.current = { start: event.clientY, time: performance.now() }; setDragging(true); event.currentTarget.setPointerCapture(event.pointerId); };
  const move = (event: PointerEvent<HTMLDivElement>) => { if (dragging) setOffset(Math.max(0, event.clientY - drag.current.start)); };
  const end = (event: PointerEvent<HTMLDivElement>) => { if (!dragging) return; setDragging(false); const distance = Math.max(0, event.clientY - drag.current.start), velocity = distance / Math.max(1, performance.now() - drag.current.time); if (shouldDismissSheet(distance, velocity)) close(); else setOffset(0); };
  if (!mounted || !open) return null;
  return createPortal(<div className={`modal-layer ${closing ? 'closing' : ''} ${presentation ? `presentation-${presentation}` : ''}`} onClick={event => { if (event.target === event.currentTarget) close(); }}><div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} tabIndex={-1} className={`dialog ${sheet ? 'sheet' : ''} ${dragging ? 'dragging' : ''}`} style={{ transform: offset ? `translateY(${offset}px)` : undefined }}><div className="dialog-header" onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerCancel={() => { setDragging(false); setOffset(0); }}><div className="grab-handle" aria-hidden="true" /><h2 id={titleId}>{discard?"Discard unsaved changes?":title}</h2>{headerActions}<IconButton label="Close dialog" disabled={busy} onClick={()=>close()}><X size={20} /></IconButton></div><div className="dialog-body">{discard?<p>Your unsaved changes will be lost.</p>:children}</div>{(discard||footer) && <div className="dialog-footer">{discard?<><Button variant="secondary" onClick={()=>setDiscard(false)}>Keep editing</Button><Button variant="danger" onClick={()=>close(true)}>Discard</Button></>:footer}</div>}</div></div>, document.body);
}
export function BottomSheet(props: Omit<Parameters<typeof Dialog>[0], 'sheet'>) { return <Dialog {...props} sheet />; }
export function ConfirmDialog({ open, onClose, title, children, confirmLabel, busyLabel, onConfirm, busy, error, danger }: { open: boolean; onClose: () => void; title: string; children: ReactNode; confirmLabel: string; busyLabel?: string; onConfirm: () => void; busy?: boolean; error?: string | null; danger?: boolean }) {
  return <Dialog open={open} onClose={onClose} title={title} busy={busy} footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} busy={busy} busyLabel={busyLabel} onClick={onConfirm}>{confirmLabel}</Button></>}><p>{children}</p>{error && <p role="alert" className="inline-error">{error}</p>}</Dialog>;
}
