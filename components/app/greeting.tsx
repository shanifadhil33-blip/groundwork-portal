'use client';
import { useAppWords, Translated } from './app-words';
import { useNotificationLanguage } from './notification-language';
import { notificationParts } from '../../lib/ui/notifications';
import { useState } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import { request } from '../../lib/ui/api';
import { Button, Card } from '../ui';
type Prefs = { preferred_name: string | null; name_asked_at: string | null; timezone?: string | null };
export function partOfDay(hour: number) { return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; }
/** Ask once what to call the person, then greet them using a complete localized message.
 * The message owns punctuation; the name stays literal and isolated for mixed-direction text. */
export function Greeting({ tz, mode = 'both' }: { tz?: string; mode?: 'both' | 'title' | 'ask' | 'hello' }) {
  const initial = useAppWords();
  const published = useNotificationLanguage();
  const words = initial.language ? initial.words : published.words;
  const { me, workspace } = useApp(), prefs = useResource<Prefs>('/api/me/preferences');
  const first = (me.user.name ?? '').split(' ')[0] || '', [value, setValue] = useState<string | null>(null), [busy, setBusy] = useState(false);
  if (!prefs.data) return null;
  const name = prefs.data.preferred_name || first;
  const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: tz ?? workspace?.timezone ?? 'Asia/Dubai', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  async function save(body: object) { setBusy(true); try { await request('/api/me/preferences', { method: 'PATCH', body: JSON.stringify(body) }); await prefs.reload(); } finally { setBusy(false); } }
  const key = name ? `${partOfDay(hour)}, {name}` : partOfDay(hour);
  const greeting = <span data-no-translate>{notificationParts({ key, values: { name } }, initial.language && !/^en/.test(initial.language) && !words?.[key] ? {[key]:'…'} : words ?? {}).map((part, i) => part.parameter ? <bdi key={i} data-no-translate>{part.text}</bdi> : part.text)}</span>;
  // Desert Stone: the title mode is the page heading; the name question lives lower down (ask mode).
  if (mode === 'title') return <Translated><h1 className="greeting-title">{greeting}</h1></Translated>;
  if (mode === 'hello') return <Translated><p className="greeting">{greeting}</p></Translated>;
  if (mode === 'ask' && prefs.data.name_asked_at) return null;
  if (!prefs.data.name_asked_at) return <Translated><Card className="stack compact name-ask"><strong>What should I call you?</strong><label className="field"><span className="sr-only">Your name</span><input value={value ?? first} maxLength={40} onChange={e => setValue(e.target.value)} autoComplete="nickname" /></label><div className="row"><Button busy={busy} disabled={!(value ?? first).trim()} onClick={() => void save({ preferred_name: (value ?? first).trim() })}>Save</Button><Button variant="ghost" disabled={busy} onClick={() => void save({ name_asked: true })}>Not now</Button></div></Card></Translated>;
  return <Translated><p className="greeting">{greeting}</p></Translated>;
}
