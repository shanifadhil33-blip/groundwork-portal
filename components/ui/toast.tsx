'use client';
import { createPortal } from 'react-dom';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button, IconButton } from './button';
type Toast = { id: number; message: string; action?: { label: string; onClick: () => void | Promise<void> } };
const Context = createContext<(message: string, action?: Toast['action']) => void>(() => {});
function ToastItem({ toast, dismiss }: { toast: Toast; dismiss: () => void }) {
  const remaining = useRef(8000), start = useRef(0), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(false);
  useEffect(() => { if (paused || busy) return; start.current = Date.now(); timer.current = setTimeout(dismiss, remaining.current); return () => { if (timer.current) clearTimeout(timer.current); remaining.current -= Date.now() - start.current; }; }, [paused, busy, dismiss]);
  return <div className="toast" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setPaused(false); }}><p>{error ? 'We couldn’t undo this. Try again.' : toast.message}</p>{toast.action && <Button variant="ghost" busy={busy} onClick={async () => { setBusy(true); setError(false); try { await toast.action!.onClick(); dismiss(); } catch { setError(true); remaining.current = 8000; } finally { setBusy(false); } }}>{toast.action.label}</Button>}<IconButton label="Dismiss notification" onClick={dismiss}><X size={16} /></IconButton></div>;
}
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]), [mounted, setMounted] = useState(false), id = useRef(0);
  useEffect(() => setMounted(true), []);
  const show = (message: string, action?: Toast['action']) => setToasts(current => [...current, { id: ++id.current, message, action }].slice(-3));
  return <Context.Provider value={show}>{children}{mounted && createPortal(<div className="toast-region" aria-live="polite" aria-relevant="additions">{toasts.map(toast => <ToastItem key={toast.id} toast={toast} dismiss={() => setToasts(items => items.filter(item => item.id !== toast.id))} />)}</div>, document.body)}</Context.Provider>;
}
export const useToast = () => useContext(Context);
