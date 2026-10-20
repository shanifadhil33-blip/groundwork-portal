'use client';
import { useState } from 'react';
import { Button, Card } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { LEARN_REPLIES } from '../../lib/learn-habits';
import { useResource } from './resource';

type Suggestion = { id: string; text: string; area?: string };

export function HabitView({ suggestions, busy, notice, error, onRemember }: { suggestions: Suggestion[]; busy: boolean; notice: string; error: string; onRemember: (area: string) => void }) {
  if (!suggestions.length && !notice) return null;
  return <Card className="stack habit-card"><h2>{LEARN_REPLIES.rememberArea}</h2>
    <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>{suggestions.map(item => <li key={item.id} className="stack compact">
      <p>{item.text}</p>
      {item.area && <><p data-no-translate>{item.area}</p><Button busy={busy} onClick={() => onRemember(item.area!)}>Remember</Button></>}
    </li>)}</ul>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </Card>;
}

export function HabitCard({ base }: { base: string }) {
  const habits = useResource<{ suggestions: Suggestion[] }>(`${base}/habits`);
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('');
  if (!habits.data) return null;
  return <HabitView suggestions={habits.data.suggestions} busy={busy} notice={notice} error={error} onRemember={area => void (async () => {
    setBusy(true); setError('');
    try { const saved = await post<{ reply: string }>(`${base}/habits`, { area }); setNotice(saved.reply); await habits.reload(); }
    catch (e) { setError(e instanceof RequestError ? e.message : 'That did not save. Try again.'); }
    finally { setBusy(false); }
  })()} />;
}
