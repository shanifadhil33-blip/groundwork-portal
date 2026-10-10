'use client';
import { createPortal } from 'react-dom';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; size?: 'sm' | 'md' | 'lg'; busy?: boolean; busyLabel?: string };
export function Button({ variant = 'primary', size = 'md', busy, busyLabel, children, className = '', disabled, ...props }: Props) {
  const [spin, setSpin] = useState(false);
  useEffect(() => { if (!busy) { setSpin(false); return; } const timer = setTimeout(() => setSpin(true), 300); return () => clearTimeout(timer); }, [busy]);
  return <button type="button" {...props} disabled={disabled || busy} aria-busy={busy || undefined} className={`button ${variant} ${size} ${className}`}><span className="button-sizer" aria-hidden={!!busy}>{children}</span>{busy && <span className="button-busy" role="status">{spin && <LoaderCircle size={16} className="spinner" />}<span>{busyLabel ?? 'Working…'}</span></span>}</button>;
}
export function IconButton({ label, children, ...props }: Omit<Props, 'children'> & { label: string; children: ReactNode }) {
  const id = useId(), wrapper = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false), [position, setPosition] = useState({ top: 0, left: 0 });
  function show() { const rect = wrapper.current?.getBoundingClientRect(); if (rect) { setPosition({ top: Math.max(8, rect.top - 40), left: Math.max(96, Math.min(innerWidth - 96, rect.left + rect.width / 2)) }); setVisible(true); } }
  return <span ref={wrapper} className="tooltip-wrap" onMouseEnter={() => { if (matchMedia('(hover:hover) and (pointer:fine)').matches) show(); }} onMouseLeave={() => setVisible(false)} onFocus={event => { if ((event.target as HTMLElement).matches(':focus-visible')) show(); }} onBlur={() => setVisible(false)}><Button {...props} variant={props.variant ?? 'ghost'} aria-label={label} aria-describedby={visible ? id : undefined} className={`icon-button ${props.className ?? ''}`}>{children}</Button>{visible && createPortal(<span id={id} role="tooltip" className="tooltip portal-tooltip" style={{ position: 'fixed', ...position }}>{label}</span>, document.body)}</span>;
}
