'use client';
import { useEffect, useState } from 'react';
import { useContext } from 'react';
import { AppContext } from '../app/context';
import { formatDate } from '../../lib/dates';
import { relativeLabel } from '../../lib/ui/helpers';
function exact(value: string, timezone?:string) { const date = new Date(value); return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(undefined, { timeZone:timezone, dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Unknown time'; }
export function LocalTime({ value, short = false, dateOnly = false }: { value: string | null; short?: boolean; dateOnly?: boolean }) {
 const context=useContext(AppContext),timezone=context?.workspace?.timezone??'Asia/Dubai';
 const [text,setText]=useState<string>(),[full,setFull]=useState<string>();
 useEffect(()=>{if(value){const calendar=dateOnly||/^\d{4}-\d{2}-\d{2}$/.test(value);setFull(calendar?formatDate(value,timezone):exact(value,timezone));setText(short||calendar?formatDate(value,timezone,short):exact(value,timezone));}},[value,short,dateOnly,timezone]);
 return <time dateTime={value??undefined} title={full} className="local-time">{value?text??'—':'Not yet'}</time>;
}
export function RelativeTime({ value }: { value: string }) { const context=useContext(AppContext),timezone=context?.workspace?.timezone??'Asia/Dubai'; const [label, setLabel] = useState('—'), [full, setFull] = useState(''), [show, setShow] = useState(false); useEffect(() => { const tick = () => { setLabel(relativeLabel(value, Date.now())); setFull(exact(value,timezone)); }; tick(); const timer = setInterval(tick, 60000); return () => clearInterval(timer); }, [value,timezone]); return <button className="time-button" title={full} aria-label={`${label}. ${full}`} onClick={() => setShow(!show)}><time dateTime={value}>{show ? full : label}</time></button>; }
