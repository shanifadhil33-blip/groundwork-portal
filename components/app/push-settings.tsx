'use client';
import { useApp } from './context';
import { useEffect, useState } from 'react';
import { Button, useToast } from '../ui';
import { request, RequestError } from '../../lib/ui/api';

type State = 'loading' | 'unsupported' | 'ios' | 'blocked' | 'off' | 'on' | 'unready';
const b64 = (s: string) => { const p = '='.repeat((4 - s.length % 4) % 4), raw = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };
const device = () => { const u = navigator.userAgent; const os = /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iPhone' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Computer'; const br = /Edg\//.test(u) ? 'Edge' : /Firefox/.test(u) ? 'Firefox' : /Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : 'Browser'; return `${br} on ${os}`; };

/** One switch: notifications on this phone or computer. Free web push, no app store. */
export function PushSettings() {
  const { me } = useApp(), demo = !!me.user.is_demo;
  const [receipt, setReceipt] = useState(false);
  const [state, setState] = useState<State>('loading'), [busy, setBusy] = useState(false), [error, setError] = useState(''), [key, setKey] = useState<string | null>(null), toast = useToast();
  useEffect(() => { setReceipt(false); setError(''); void (async () => {
    if (demo) { setState(localStorage.getItem(`groundwork-demo-push:${me.user.id}`)==='on'?'on':'off'); return; }
    const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = matchMedia('(display-mode: standalone)').matches;
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return setState(ios && !standalone ? 'ios' : 'unsupported');
    try { const s = await request<{ key: string | null }>('/api/me/push'); setKey(s.key); if (!s.key) return setState('unready'); } catch { return setState('unready'); }
    if (Notification.permission === 'denied') return setState('blocked');
    const reg = await navigator.serviceWorker.getRegistration('/'), sub = await reg?.pushManager.getSubscription();
    setState(sub ? 'on' : 'off');
  })(); }, [demo, me.user.id]);
  async function turnOn() {
    setBusy(true); setError('');
    try {
      if (demo) { await request('/api/me/push', { method: 'POST', body: '{}' }); localStorage.setItem(`groundwork-demo-push:${me.user.id}`, 'on'); setState('on'); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setState(perm === 'denied' ? 'blocked' : 'off'); return; }
      const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key!) });
      await request('/api/me/push', { method: 'POST', body: JSON.stringify({ ...sub.toJSON(), device: device() }) });
      setState('on'); toast('Notifications are on.');
    } catch (e) { setError(e instanceof RequestError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setError('');
    try { if (demo) { await request('/api/me/push', { method: 'DELETE', body: '{}' }); localStorage.removeItem(`groundwork-demo-push:${me.user.id}`); setState('off'); setReceipt(false); return; }
      const reg = await navigator.serviceWorker.getRegistration('/'), sub = await reg?.pushManager.getSubscription();
      if (sub) { await request('/api/me/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setState('off'); toast('Notifications are off.');
    } catch (e) { setError(e instanceof RequestError ? e.message : 'That did not work. Try again.'); } finally { setBusy(false); }
  }
  async function test() { setBusy(true); try { const r = await request<{ sent: number; simulated?: boolean }>('/api/me/push/test', { method: 'POST' }); if(r.simulated){setReceipt(true);return;} toast(r.sent ? 'Sent. Look for it on this device.' : 'Nothing was sent. Turn it off and on again.'); } catch { toast('That did not send. Try again.'); } finally { setBusy(false); } }
  const on = state === 'on', can = state === 'on' || state === 'off';
  return <section className="stack"><h2>Notifications</h2>
    {demo && <p>Demo preview. Nothing is sent to a device.</p>}
    {receipt && <p role="status">Demo test shown here. Nothing was sent.</p>}
    <p>Get a message on this phone or computer when a job is given to you, when a job is done, and when a job is late.</p>
    {can && <div className="switch-row"><span id="push-label">{demo ? 'Demo notifications' : 'Notifications on this device'}</span>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="push-label" className="switch" disabled={busy} onClick={() => void (on ? turnOff() : turnOn())}><span /></button></div>}
    {state === 'loading' && <p className="small muted">Checking this device…</p>}
    {state === 'ios' && <p className="small">On iPhone, first add Groundwork to your Home Screen: tap Share, then Add to Home Screen. Open it from there and come back here.</p>}
    {state === 'unsupported' && <p className="small">This browser cannot show notifications. Try Chrome, Edge, Firefox or Safari.</p>}
    {state === 'blocked' && <p className="small">Notifications are blocked for this site. Allow them in your browser settings, then come back.</p>}
    {state === 'unready' && <p className="small muted">Notifications are not set up yet. Try again later.</p>}
    {on && <div><Button variant="secondary" busy={busy} onClick={() => void test()}>Send a test</Button></div>}
    {!demo && <p className="small muted">Each phone or computer has its own switch.</p>}
    {error && <p className="inline-error" role="alert">{error}</p>}</section>;
}
