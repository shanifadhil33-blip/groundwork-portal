'use client';
import { useEffect, useState } from 'react';
import { relativeLabel } from '../../lib/ui/helpers';
function exact(value: string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Unknown time'; }
export function LocalTime({ value }: { value: string | null }) { const [label, setLabel] = useState<string>(); useEffect(() => { if (value) setLabel(exact(value)); }, [value]); return <time dateTime={value ?? undefined} className="local-time">{value ? label ?? '—' : 'Not yet'}</time>; }
export function RelativeTime({ value }: { value: string }) { const [label, setLabel] = useState('—'), [full, setFull] = useState(''), [show, setShow] = useState(false); useEffect(() => { const tick = () => { setLabel(relativeLabel(value, Date.now())); setFull(exact(value)); }; tick(); const timer = setInterval(tick, 60000); return () => clearInterval(timer); }, [value]); return <button className="time-button" title={full} aria-label={`${label}. ${full}`} onClick={() => setShow(!show)}><time dateTime={value}>{show ? full : label}</time></button>; }
