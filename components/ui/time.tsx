'use client';
import { useEffect, useState } from 'react';
import { useContext } from 'react';
import { AppContext } from '../app/context';
import { formatDate } from '../../lib/dates';
import { formatInLang } from '../../lib/date-lang';
import { useUiLang } from '../app/use-ui-lang';
import { relativeLabel } from '../../lib/ui/helpers';
function exact(value: string, timezone?:string, lang = 'en') { const date = new Date(value); return Number.isFinite(date.getTime()) ? formatInLang(date, { timeZone:timezone, dateStyle: 'medium', timeStyle: 'short' }, lang, undefined) : 'Unknown time'; }
export function LocalTime({ value, short = false, dateOnly = false }: { value: string | null; short?: boolean; dateOnly?: boolean }) {
 const context=useContext(AppContext),timezone=context?.workspace?.timezone??'Asia/Dubai';
 const [text,setText]=useState<string>(),[full,setFull]=useState<string>(),lang=useUiLang();
 useEffect(()=>{if(value){const calendar=dateOnly||/^\d{4}-\d{2}-\d{2}$/.test(value);setFull(calendar?formatDate(value,timezone,false,lang):exact(value,timezone,lang));setText(short||calendar?formatDate(value,timezone,short,lang):exact(value,timezone,lang));}},[value,short,dateOnly,timezone,lang]);
 return <time dateTime={value??undefined} title={full} className="local-time" data-no-translate={text?true:undefined}>{value?text??'Not set':'Not yet'}</time>;
}
export function RelativeTime({ value }: { value: string }) { const context=useContext(AppContext),timezone=context?.workspace?.timezone??'Asia/Dubai'; const [label, setLabel] = useState('Not set'), [full, setFull] = useState(''), [show, setShow] = useState(false); useEffect(() => { const tick = () => { setLabel(relativeLabel(value, Date.now())); setFull(exact(value,timezone)); }; tick(); const timer = setInterval(tick, 60000); return () => clearInterval(timer); }, [value,timezone]); return <button className="time-button" title={full} aria-label={`${label}. ${full}`} onClick={() => setShow(!show)}><time dateTime={value}>{show ? full : label}</time></button>; }
