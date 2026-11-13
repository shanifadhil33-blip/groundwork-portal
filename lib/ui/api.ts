import { statusCopy } from './request-errors';
import { safeRedirect } from './helpers';
export class RequestError extends Error { constructor(public status: number, message: string, public fields?: Record<string, string[]>, public code?: string) { super(message); } }
export function handleSessionFailure(status: number, code?: string) {
  if (status !== 401 || typeof window === 'undefined') return;
  const demo = code === 'demo_ended' || document.cookie.split(';').some(part => part.trim() === 'groundwork-demo=1');
  window.location.replace(demo ? '/demo-ended' : (code==='session_expired'?'/session-ended':'/sign-in')+'?callbackUrl=' + encodeURIComponent(safeRedirect(window.location.pathname + window.location.search)));
}
/** A read gives up after 20 s and a write after 30 s, so nothing waits forever (bug 92). */
export const READ_TIMEOUT_MS = 20_000, WRITE_TIMEOUT_MS = 30_000;
/** After 8 s the app says "This is taking longer than usual." once, at the top of the screen. */
export const SLOW_AFTER_MS = 8_000;
let slowCount = 0;
function slowSignal(delta: 1 | -1) {
  if (typeof window === 'undefined') return;
  slowCount = Math.max(0, slowCount + delta);
  window.dispatchEvent(new CustomEvent('groundwork-slow', { detail: slowCount > 0 }));
}

/** Every create carries an Idempotency-Key (bug 107). The server keeps the first answer for 24 h, so a retry never makes a second job. */
function withKey(init?: RequestInit): RequestInit | undefined {
  if (init?.method !== 'POST') return init;
  const headers = new Headers(init.headers);
  if (headers.has('Idempotency-Key')) return init;
  headers.set('Idempotency-Key', crypto.randomUUID());
  return { ...init, headers: Object.fromEntries(headers.entries()) };
}
export async function request<T>(url: string, given?: RequestInit): Promise<T> {
  // Only a key the screen set itself is retried: those endpoints store it. An added key never causes a retry.
  const keyed = !!given?.method && given.method !== 'GET' && new Headers(given?.headers).has('Idempotency-Key');
  const init = withKey(given);
  const write = !!init?.method && init.method !== 'GET';
  const run = async () => {
    const limit = new AbortController();
    const forward = () => limit.abort();
    init?.signal?.addEventListener('abort', forward, { once: true });
    let timedOut = false, slow = false;
    const timer = setTimeout(() => { timedOut = true; limit.abort(); }, write ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS);
    const slowTimer = setTimeout(() => { slow = true; slowSignal(1); }, SLOW_AFTER_MS);
    try {
      const headers = new Headers(init?.headers);
      if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
      return await fetch(url, { ...init, signal: limit.signal, headers, cache: 'no-store' });
    } catch (error) {
      if (timedOut) throw new RequestError(408, 'This is taking too long. Please try again.', undefined, 'timeout');
      throw error;
    } finally {
      clearTimeout(timer); clearTimeout(slowTimer); if (slow) slowSignal(-1);
      init?.signal?.removeEventListener('abort', forward);
    }
  };
  let response: Response;
  try { response = await run(); }
  catch (error) {
    if (error instanceof RequestError) throw error;
    if (isAbort(error)) throw new RequestError(0, 'Stopped.', undefined, 'aborted');
    const hidden = pageHidden();
    // Phones freeze background tabs and drop their sockets; that is not being offline. Reads try once more.
    // A create with a key is safe to send again: the server answers a repeat with the first result.
    if (!write || keyed) {
      if (hidden) await visible();
      for (const wait of write ? [600] : [600, 1500]) { await pause(wait); try { response = await run(); break; } catch (retryError) { if (retryError instanceof RequestError) throw retryError; if (isAbort(retryError)) throw new RequestError(0, 'Stopped.', undefined, 'aborted'); } }
    }
    if (!response!) throw new RequestError(0, networkCopy(), undefined, 'network');
  }
  const result = await readResponse<T>(response);
  // A write makes cached lists stale here and in other tabs.
  if (write && typeof window !== 'undefined') window.dispatchEvent(new Event('groundwork-write'));
  return result;
}
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    handleSessionFailure(response.status, data?.error?.code);
    throw new RequestError(response.status, statusCopy(response.status, data?.error?.message), data?.error?.fields, data?.error?.code);
  }
  if (data === null) throw new RequestError(502, 'We couldn’t read the response. Please try again.');
  return data as T;
}
// This endpoint commits the session and sandbox cookies before returning success.
// Its caller only needs the status to navigate, so never wait for a streamed body.
export async function postDemoStart(body: { persona: string; language: string }): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    let response: Response;
    try {
      response = await fetch('/api/demo/start', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, cache: 'no-store', signal: controller.signal });
    } catch {
      throw new RequestError(0, networkCopy(), undefined, 'network');
    }
    if (!response.ok) await readResponse<never>(response);
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}
export const post = <T,>(url: string, body?: unknown, init?: Pick<RequestInit, 'signal'>) => request<T>(url, { method: 'POST', ...init, ...(body ? { body: JSON.stringify(body) } : {}) });
const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';
const pageHidden = () => typeof document !== 'undefined' && document.hidden;
const pause = (ms: number) => new Promise(done => setTimeout(done, ms));
const visible = () => new Promise<void>(done => { if (!pageHidden()) return done(); const on = () => { if (!pageHidden()) { document.removeEventListener('visibilitychange', on); done(); } }; document.addEventListener('visibilitychange', on); });
const networkCopy = () => typeof navigator !== 'undefined' && navigator.onLine === false ? 'You are offline. Changes will be sent when you are back online.' : 'We couldn’t reach Groundwork. Please try again.';
