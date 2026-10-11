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
  try { response = await fetch(url, { ...init, headers: { ...(init?.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...init?.headers }, cache: 'no-store' }); }
  catch { reportRequestFailure(0); throw new RequestError(0, 'We couldn’t connect. Check your connection and try again.', undefined, 'network'); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    handleSessionFailure(response.status, data?.error?.code);
    reportRequestFailure(response.status);
    throw new RequestError(response.status, response.status >= 500 ? 'We couldn’t complete that. Please try again.' : data?.error?.message ?? 'We couldn’t complete that. Please try again.', data?.error?.fields, data?.error?.code);
  }
  if (data === null) throw new RequestError(502, 'We couldn’t read the response. Please try again.');
  return data as T;
}
export const post = <T,>(url: string, body?: unknown) => request<T>(url, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) });
