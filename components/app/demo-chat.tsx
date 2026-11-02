'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCheck, SendHorizontal } from 'lucide-react';
import { useApp } from './context';
import { Mark } from '../public/chrome';
import { post, RequestError } from '../../lib/ui/api';
import { failureWords, INCOMPLETE } from '../../lib/agent/failure-words';
import { chatText, chatTime, DEMO_CHAT_COPY as C, DEMO_CHAT_STARTERS } from '../../lib/ui/demo-chat';

type Line = { id: number; from: 'me' | 'agent'; text: string; at: Date };
type Pending = { id: string; summary: string };
type Reply = { available: boolean; reply?: string; message?: string; localized?: boolean; pending_action?: { id: string; summary: string; why?: string } };
type Send = { sent: Line[]; confirm?: string };

export function DemoChat() {
  const { member, workspace } = useApp();
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Send | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const counter = useRef(0), lock = useRef(false), end = useRef<HTMLDivElement>(null), abort = useRef<AbortController | null>(null);
  const language = typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';
  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [lines, busy, failed, pending]);

  if (!workspace?.is_demo || !member) {
    return <div className="demo-chat-page"><p className="demo-chat-only">{C.demoOnly} <Link href="/demo">{C.demoOnlyLink}</Link></p></div>;
  }
  const client = member.role === 'client';
  const add = (from: Line['from'], text: string) => ({ id: ++counter.current, from, text, at: new Date() });

  async function run(job: Send, all: Line[]) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setFailed(null);
    const controller = new AbortController(); abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 48_000);
    try {
      const messages = all.slice(-30).map(l => ({ role: l.from === 'me' ? 'user' : 'assistant', content: l.text }));
      const result = await post<Reply>(`/api/workspaces/${member!.workspace_id}/assistant`, { confirm_action_id: job.confirm, messages }, { signal: controller.signal });
      const words = !result.available
        ? (result.localized && result.message ? result.message : failureWords(language, result.message))
        : result.reply ?? '';
      setLines(current => {
        const next = [...current];
        if (words) next.push(add('agent', chatText(words, client)));
        if (result.pending_action) next.push(add('agent', chatText(result.pending_action.summary, client)));
        return next;
      });
      setPending(result.available && result.pending_action ? { id: result.pending_action.id, summary: result.pending_action.summary } : null);
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) return;
      setFailed(job);
    } finally { clearTimeout(timer); abort.current = null; lock.current = false; setBusy(false); }
  }
  function submit(text: string) {
    const value = text.trim();
    if (!value || busy) return;
    if (pending) { void post(`/api/workspaces/${member!.workspace_id}/assistant/log/${pending.id}/decline`, {}).catch(() => undefined); setPending(null); }
    const sent = [...lines, add('me', chatText(value))];
    setLines(sent); setDraft('');
    void run({ sent }, sent);
  }
  function answer(yes: boolean) {
    const open = pending; if (!open || busy) return;
    if (yes) { void run({ sent: lines, confirm: open.id }, lines); return; }
    void post(`/api/workspaces/${member!.workspace_id}/assistant/log/${open.id}/decline`, {}).catch(() => undefined);
    setPending(null); setLines(current => [...current, add('agent', C.declined)]);
  }

  return <div className="demo-chat-page">
    <p className="demo-chat-label" role="note">{C.label}</p>
    <section className="phone-frame" aria-label={C.windowLabel}>
      <header className="chat-header">
        <span className="chat-avatar" aria-hidden="true"><Mark /></span>
        <span className="chat-who"><strong>{C.name}</strong><small>{busy ? C.typing : C.online}</small></span>
      </header>
      <div className="chat-scroll" aria-live="polite">
        {!lines.length && <div className="chat-starters"><p>{C.starters}</p>{DEMO_CHAT_STARTERS.map(s => <button key={s} type="button" className="chat-chip" disabled={busy} onClick={e => submit(e.currentTarget.textContent ?? s)}>{s}</button>)}</div>}
        {lines.map((l, i) => <div key={l.id} className={`bubble ${l.from === 'me' ? 'out' : 'in'}`} data-no-translate>
          <span className="bubble-text">{l.text}</span>
          <span className="bubble-meta"><time>{chatTime(l.at, language)}</time>{l.from === 'me' && (i < lines.length - 1 || !busy ? <CheckCheck size={14} className="tick read" aria-label={C.read} /> : <Check size={14} className="tick" aria-label={C.delivered} />)}</span>
        </div>)}
        {pending && !busy && <div className="chat-chips"><button type="button" className="chat-chip" onClick={() => answer(true)}>{C.yes}</button><button type="button" className="chat-chip" onClick={() => answer(false)}>{C.no}</button></div>}
        {busy && <div className="bubble in typing" role="status" aria-label={C.typing}><span /><span /><span /></div>}
        {failed && <div className="chat-error" role="alert"><p>{C.errorTitle}</p><button type="button" className="chat-chip" onClick={() => void run(failed, failed.sent)}>{C.retry}</button></div>}
        <div ref={end} />
      </div>
      <form className="chat-input" onSubmit={e => { e.preventDefault(); submit(draft); }}>
        <input value={draft} onChange={e => setDraft(e.target.value)} placeholder={C.placeholder} aria-label={C.placeholder} autoComplete="off" enterKeyHint="send" />
        <button type="submit" className="chat-send" aria-label={C.send} disabled={busy || !draft.trim()}><SendHorizontal size={20} aria-hidden="true" /></button>
      </form>
    </section>
  </div>;
}
