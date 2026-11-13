'use client';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  /** Optional leading lucide icon. While loading, the spinner takes its place. */
  icon?: ReactNode;
  /** Loading: announces busy and can not be pressed again, so a form is never sent twice. */
  busy?: boolean;
  /** The busy word, for example "Saving". Space for it is kept from the start, so the width never jumps. */
  busyLabel?: string;
};

/** The spinner only shows when the action takes longer than this. */
const SPINNER_AFTER_MS = 150;

export function Button({ variant = 'primary', size = 'md', icon, busy, busyLabel, children, className = '', disabled, onClick, ...props }: Props) {
  const [spin, setSpin] = useState(false);
  useEffect(() => {
    if (!busy) { setSpin(false); return; }
    const timer = setTimeout(() => setSpin(true), SPINNER_AFTER_MS);
    return () => clearTimeout(timer);
  }, [busy]);
  function click(event: MouseEvent<HTMLButtonElement>) {
    if (busy) { event.preventDefault(); return; }
    onClick?.(event);
  }
  return (
    <button type="button" {...props} disabled={disabled || busy} aria-busy={busy || undefined} data-label={busyLabel} className={`button ${variant} ${size} ${className}`} onClick={click}>
      <span className="button-sizer" aria-hidden={!!busy}>{icon}{children}</span>
      {busy && <span className="button-busy" role="status">{spin && <LoaderCircle className="spinner" aria-hidden="true" />}<span>{busyLabel ?? children}</span></span>}
    </button>
  );
}

/** Icon only buttons are for Close, the bell and More. The label is read out and shown as a tooltip on laptop. */
export function IconButton({ label, children, variant = 'ghost', size: _size, busy, busyLabel: _busyLabel, className = '', ...props }: Omit<Props, 'children' | 'icon'> & { label: string; children: ReactNode }) {
  const id = useId(), wrapper = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  const fine = () => matchMedia('(hover:hover) and (pointer:fine)').matches;
  function show() {
    if (!fine()) return;
    const rect = wrapper.current?.getBoundingClientRect();
    if (!rect) return;
    setPosition({ top: Math.max(8, rect.top - 36), left: Math.max(96, Math.min(innerWidth - 96, rect.left + rect.width / 2)) });
    setVisible(true);
  }
  return (
    <span ref={wrapper} className="tooltip-wrap" onPointerDown={() => setVisible(false)} onClick={() => setVisible(false)} onMouseEnter={show} onMouseLeave={() => setVisible(false)} onFocus={event => { if ((event.target as HTMLElement).matches(':focus-visible')) show(); }} onBlur={() => setVisible(false)}>
      <button type="button" {...props} aria-label={label} aria-describedby={visible ? id : undefined} aria-busy={busy || undefined} className={`button ${variant} icon-button ${className}`}>{children}</button>
      {visible && createPortal(<span id={id} role="tooltip" className="tooltip portal-tooltip" style={{ position: 'fixed', ...position }}>{label}</span>, document.body)}
    </span>
  );
}
