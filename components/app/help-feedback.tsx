'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Send, X } from 'lucide-react';
import { Button } from '../ui';
import { post, RequestError } from '../../lib/ui/api';
import { deviceSummary, LAST_PAGE_KEY } from '../../lib/ui/device';

type Shot = { type: 'image/jpeg'; data: string; preview: string };
/** Shrink a picture in the browser so it is small and free to store. */
async function shrink(file: File): Promise<Shot> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  for (const quality of [0.8, 0.6, 0.45]) { const url = canvas.toDataURL('image/jpeg', quality); if (url.length * 0.75 < 1_000_000) return { type: 'image/jpeg', data: url.split(',')[1], preview: url }; }
  throw new Error('too_big');
}
export function HelpFeedback() {
  const [message, setMessage] = useState(''), [shot, setShot] = useState<Shot | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState(''), [sent, setSent] = useState(false);
  const file = useRef<HTMLInputElement>(null), trap = useRef<HTMLInputElement>(null);
  async function pick(f?: File) { setError(''); if (!f) return; if (!f.type.startsWith('image/')) { setError('Pick a picture.'); return; } try { setShot(await shrink(f)); } catch { setError('That picture is too big. Try another one.'); } }
  async function send() {
    if (message.trim().length < 3) { setError('Write a few words first.'); return; }
    setBusy(true); setError('');
    try {
      await post('/api/feedback', { message: message.trim(), page: sessionStorage.getItem(LAST_PAGE_KEY) ?? '/settings', device: deviceSummary(), website: trap.current?.value || undefined, ...(shot ? { screenshot: { type: shot.type, data: shot.data } } : {}) });
      setSent(true); setMessage(''); setShot(null);
    } catch (e) { setError(e instanceof RequestError && e.status !== 0 ? e.message : 'We couldn’t send it. Please try again.'); }
    finally { setBusy(false); }
  }
  if (sent) return <section className="stack help-feedback"><h2>Thank you</h2><p>We got your message.</p><Button variant="secondary" onClick={() => setSent(false)}>Send another</Button></section>;
  return <section className="stack help-feedback">
    <h2>Help and feedback</h2>
    <p className="small muted">Tell us what is wrong or what you need.</p>
    <label className="sr-only" htmlFor="feedback-message">Your message</label>
    <textarea id="feedback-message" rows={5} maxLength={4000} value={message} onChange={e => setMessage(e.target.value)} placeholder="Type here" aria-invalid={!!error && message.trim().length < 3} />
    <input ref={trap} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="sr-only" />
    <input ref={file} type="file" accept="image/*" className="sr-only" onChange={e => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
    {shot ? <div className="feedback-shot">{/* eslint-disable-next-line @next/next/no-img-element -- local preview */}<img src={shot.preview} alt="Your picture" /><Button variant="ghost" size="sm" onClick={() => setShot(null)} aria-label="Remove picture"><X size={16} />Remove</Button></div>
      : <Button variant="secondary" onClick={() => file.current?.click()}><ImagePlus size={16} aria-hidden="true" />Add a picture</Button>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    <Button className="big-action" busy={busy} disabled={busy} onClick={() => void send()}><Send size={16} aria-hidden="true" />Send</Button>
  </section>;
}
