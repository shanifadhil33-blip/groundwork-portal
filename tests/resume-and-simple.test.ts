import { afterEach, describe, expect, it, vi } from 'vitest';
import { request } from '../lib/ui/api';
import { requestErrorCopy } from '../lib/ui/request-errors';

type Doc = { hidden: boolean; listeners: (() => void)[]; addEventListener: (n: string, f: () => void) => void; removeEventListener: () => void };
function setup(hidden: boolean, online = true) {
  const events: Event[] = [];
  const doc: Doc = { hidden, listeners: [], addEventListener: (_n, f) => doc.listeners.push(f), removeEventListener: () => {}, };
  vi.stubGlobal('document', doc); vi.stubGlobal('navigator', { onLine: online });
  vi.stubGlobal('window', { dispatchEvent: (e: Event) => events.push(e), location: { pathname: '/', search: '' } });
  vi.stubGlobal('CustomEvent', class extends Event { detail: unknown; constructor(n: string, o?: { detail?: unknown }) { super(n); this.detail = o?.detail; } });
  return { doc, events };
}
const ok = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('coming back to the app on a phone', () => {
  it('never shows the connection card for an aborted request', async () => {
    const { events } = setup(false);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('gone', 'AbortError')));
    await expect(request('/api/x')).rejects.toMatchObject({ code: 'aborted' });
    expect(events).toHaveLength(0);
  });
  it('waits until the page is visible, retries quietly and succeeds', async () => {
    vi.useFakeTimers();
    const { doc, events } = setup(true);
    const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValue(ok());
    vi.stubGlobal('fetch', fetch);
    const pending = request<{ ok: boolean }>('/api/x');
    await vi.advanceTimersByTimeAsync(5000); expect(fetch).toHaveBeenCalledTimes(1);
    doc.hidden = false; doc.listeners.forEach(f => f());
    await vi.advanceTimersByTimeAsync(700);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(events).toHaveLength(0);
  });
  it('shows the card only after two quiet retries fail', async () => {
    vi.useFakeTimers();
    const { events } = setup(false);
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    const pending = request('/api/x').catch((e: Error) => e);
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending as Error).message).toBe('We couldn’t reach Groundwork. Please try again.');
    expect(fetch).toHaveBeenCalledTimes(3); expect(events).toHaveLength(1);
  });
  it('does not retry a change, so nothing is saved twice', async () => {
    setup(false);
    const fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    vi.stubGlobal('fetch', fetch);
    await expect(request('/api/x', { method: 'POST' })).rejects.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('says offline in plain words only when the phone is offline', () => {
    setup(false, false); expect(requestErrorCopy(0)).toBe('You are offline. Please check your internet.');
    setup(false, true); expect(requestErrorCopy(0)).toBe('We couldn’t reach Groundwork. Please try again.');
  });
});
