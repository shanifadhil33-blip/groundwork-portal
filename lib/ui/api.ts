import { reportRequestFailure } from './request-errors';
import { safeRedirect } from './helpers';
export class RequestError extends Error { constructor(public status: number, message: string, public fields?: Record<string, string[]>, public code?: string) { super(message); } }
export function handleSessionFailure(status: number, code?: string) {
  if (status !== 401 || typeof window === 'undefined') return;
  const demo = code === 'demo_ended' || document.cookie.split(';').some(part => part.trim() === 'groundwork-demo=1');
  window.location.replace(demo ? '/demo-ended' : (code==='session_expired'?'/session-ended':'/sign-in')+'?callbackUrl=' + encodeURIComponent(safeRedirect(window.location.pathname + window.location.search)));
}
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  const run = () => fetch(url, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }, cache: 'no-store' });
  try { response = await run(); }
  catch (error) {
    if (isAbort(error)) throw new RequestError(0, 'Stopped.', undefined, 'aborted');
    const hidden = pageHidden();
    // Phones freeze background tabs and drop their sockets; that is not being offline.
    if (!init?.method || init.method === 'GET') {
      if (hidden) await visible();
      for (const wait of [600, 1500]) { await pause(wait); try { response = await run(); break; } catch (retryError) { if (isAbort(retryError)) throw new RequestError(0, 'Stopped.', undefined, 'aborted'); } }
    }
    if (!response!) {
      if (!hidden && !pageHidden()) reportRequestFailure(0);
      throw new RequestError(0, networkCopy(), undefined, 'network');
    }
  }
  return readResponse<T>(response);
}
async function readResponse<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    handleSessionFailure(response.status, data?.error?.code);
    reportRequestFailure(response.status);
    throw new RequestError(response.status, response.status >= 500 ? 'We couldn’t complete that. Please try again.' : data?.error?.message ?? 'We couldn’t complete that. Please try again.', data?.error?.fields, data?.error?.code);
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
      reportRequestFailure(0);
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
const networkCopy = () => typeof navigator !== 'undefined' && navigator.onLine === false ? 'You are offline. We will try again when you are back online.' : 'We couldn’t reach Groundwork. Please try again.';
