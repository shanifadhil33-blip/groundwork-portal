'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, CheckCheck, SendHorizontal } from 'lucide-react';
import { useApp } from './context';
import { DirectedLines } from '../ui/directed-lines';
import { Mark } from '../public/chrome';
import { post, RequestError } from '../../lib/ui/api';
import { failureWords, INCOMPLETE } from '../../lib/agent/failure-words';
import { chatText, chatTime, DEMO_CHAT_COPY as C, DEMO_CHAT_STARTERS } from '../../lib/ui/demo-chat';

type Line = { id: number; from: 'me' | 'agent'; text: string; at: Date };
type Pending = { id: string; summary: string };
type Reply = { available: boolean; reply?: string; message?: string; localized?: boolean; pending_action?: { id: string; summary: string; why?: string } };
type Send = { sent: Line[]; confirm?: string };

/** embedded: shown as the WhatsApp preview tab inside the Agent panel. */
export function DemoChat({ embedded = false }: { embedded?: boolean } = {}) {
  const { member, workspace } = useApp();
  const [lines, setLines] = useState<Line[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<Send | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const counter = useRef(0), lock = useRef(false), end = useRef<HTMLDivElement>(null), abort = useRef<AbortController | null>(null), frame = useRef<HTMLElement>(null), scroller = useRef<HTMLDivElement>(null), shown = useRef(0);
  const language = typeof document === 'undefined' ? 'en' : document.documentElement.lang || 'en';
  useEffect(() => () => abort.current?.abort(), []);
  // On phones the fixed bottom tabs cover the page bottom, so size the frame to the space left between its top and the tabs.
  useLayoutEffect(() => {
    const el = frame.current; if (!el || typeof window.matchMedia !== 'function') return;
    const fit = () => {
      if (!window.matchMedia('(max-width: 640px)').matches) { el.style.removeProperty('--chat-fit'); return; }
      const tabs = document.querySelector<HTMLElement>('.bottom-tabs');
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top;
      const room = viewport - top - (tabs?.offsetHeight ?? 0) - 40;
      el.style.setProperty('--chat-fit', `${Math.max(280, Math.floor(room))}px`);
    };
    fit();
    window.addEventListener('resize', fit); window.visualViewport?.addEventListener('resize', fit);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null; ro?.observe(document.body);
    return () => { window.removeEventListener('resize', fit); window.visualViewport?.removeEventListener('resize', fit); ro?.disconnect(); };
  }, [workspace?.is_demo, member]);
  useEffect(() => {
    const box = scroller.current; if (!box) return;
    const fresh = lines.find(l => l.id > shown.current && l.from === 'agent');
    shown.current = lines[lines.length - 1]?.id ?? 0;
    const first = fresh && box.querySelector<HTMLElement>(`[data-line="${fresh.id}"]`);
    // A reply arrived: put the start of it in view instead of its end.
    if (first) box.scrollTop += first.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
    else end.current?.scrollIntoView({ block: 'end' });
  }, [lines]);
  useEffect(() => { if (busy || failed) end.current?.scrollIntoView({ block: 'end' }); }, [busy, failed]);

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

  return <div className={embedded ? 'demo-chat-page embedded' : 'demo-chat-page'}>
    <p className="demo-chat-label" role="note">{C.label}</p>
    <section ref={frame} className="phone-frame" aria-label={C.windowLabel}>
      <header className="chat-header">
        <span className="chat-avatar" aria-hidden="true"><Mark /></span>
        <span className="chat-who"><strong>{C.name}</strong><small>{busy ? C.typing : C.online}</small></span>
      </header>
      <div ref={scroller} className="chat-scroll" aria-live="polite">
        {!lines.length && <div className="chat-starters"><p>{C.starters}</p>{DEMO_CHAT_STARTERS.map(s => <button key={s} type="button" className="chat-chip" disabled={busy} onClick={e => submit(e.currentTarget.textContent ?? s)}>{s}</button>)}</div>}
        {lines.map((l, i) => <div key={l.id} data-line={l.id} className={`bubble ${l.from === 'me' ? 'out' : 'in'}`} data-no-translate>
          <div className="bubble-text"><DirectedLines text={l.text} /></div>
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
