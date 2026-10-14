'use client';
import { useState } from 'react';
import { useApp } from './context';
import { useResource } from './resource';
import { request } from '../../lib/ui/api';
import { Button, Card } from '../ui';
type Prefs = { preferred_name: string | null; name_asked_at: string | null; timezone?: string | null };
export function partOfDay(hour: number) { return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'; }
/** LEARN01: asked once what to call him, then greeted by that name. */
export function Greeting({ tz }: { tz?: string }) {
  const { me, workspace } = useApp(), prefs = useResource<Prefs>('/api/me/preferences');
  const first = (me.user.name ?? '').split(' ')[0] || '', [value, setValue] = useState<string | null>(null), [busy, setBusy] = useState(false);
  if (!prefs.data) return null;
  const name = prefs.data.preferred_name || first;
  const hour = +new Intl.DateTimeFormat('en-GB', { timeZone: tz ?? workspace?.timezone ?? 'Asia/Dubai', hour: 'numeric', hourCycle: 'h23' }).format(new Date());
  async function save(body: object) { setBusy(true); try { await request('/api/me/preferences', { method: 'PATCH', body: JSON.stringify(body) }); await prefs.reload(); } finally { setBusy(false); } }
  if (!prefs.data.name_asked_at) return <Card className="stack compact name-ask"><strong>What should I call you?</strong><label className="field"><span className="sr-only">Your name</span><input value={value ?? first} maxLength={40} onChange={e => setValue(e.target.value)} autoComplete="nickname" /></label><div className="row"><Button busy={busy} disabled={!(value ?? first).trim()} onClick={() => void save({ preferred_name: (value ?? first).trim() })}>Save</Button><Button variant="ghost" disabled={busy} onClick={() => void save({ name_asked: true })}>Not now</Button></div></Card>;
  return <p className="greeting" data-no-translate={false}>{partOfDay(hour)}{name ? <>, <span data-no-translate>{name}</span></> : null}</p>;
}
