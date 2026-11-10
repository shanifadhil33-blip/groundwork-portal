'use client';
import { createPortal } from 'react-dom';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './button';

type Toast = { id: number; message: string; action?: { label: string; onClick: () => void | Promise<void> } };
const Context = createContext<(message: string, action?: Toast['action']) => void>(() => {});
/** A plain toast stays 4 s. One with an action (Undo) stays 8 s. */
const SHOW_MS = 4000, SHOW_WITH_ACTION_MS = 8000;

function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: () => void }) {
  const remaining = useRef(toast.action ? SHOW_WITH_ACTION_MS : SHOW_MS), start = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => {
    if (paused || busy) return;
    start.current = Date.now();
    timer.current = setTimeout(dismiss, remaining.current);
    return () => { if (timer.current) clearTimeout(timer.current); remaining.current -= Date.now() - start.current; };
  }, [paused, busy, dismiss]);
  async function act() {
    setBusy(true); setError(false);
    try { await toast.action!.onClick(); dismiss(); }
    catch { setError(true); remaining.current = SHOW_WITH_ACTION_MS; }
    finally { setBusy(false); }
  }
  return (
    <div className="toast" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}>
      <p>{error ? 'We couldn’t undo this. Try again.' : toast.message}</p>
      {toast.action && <Button variant="ghost" size="sm" busy={busy} onClick={act}>{toast.action.label}</Button>}
      <IconButton label="Close" onClick={dismiss}><X /></IconButton>
    </div>
  );
}

/** One toast at a time, at the bottom. A new one replaces the old one. Never used for load errors. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null), [mounted, setMounted] = useState(false), id = useRef(0);
  useEffect(() => setMounted(true), []);
  const show = useRef((message: string, action?: Toast['action']) => setToast({ id: ++id.current, message, action })).current;
  const dismiss = useRef(() => setToast(null)).current;
  return (
    <Context.Provider value={show}>
      {children}
      {mounted && createPortal(<div className="toast-region" aria-live="polite" aria-relevant="additions">{toast && <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />}</div>, document.body)}
    </Context.Provider>
  );
}
export const useToast = () => useContext(Context);
