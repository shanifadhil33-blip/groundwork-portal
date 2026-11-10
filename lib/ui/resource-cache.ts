/**
 * One client cache for data read from the API, keyed by URL (DESIGN-SPEC 6.2).
 * A screen shows what is cached at once and refreshes in the background, so going
 * back to a list or to Home never shows a skeleton again.
 *
 * Browser only. Nothing is ever written during a server render, so data can not
 * leak between people. The cache is also emptied when the signed in person changes.
 */
export type CacheEntry = { data: unknown; at: number };

/** Cached data younger than this is used as is. Older data is shown, then refreshed. */
export const FRESH_MS = 30_000;
/** Cached data is dropped after this long. */
export const KEEP_MS = 5 * 60_000;

const entries = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<() => void>>();
let scope = '';
/** Any write makes everything read before it stale, so the next visit refreshes it. */
let staleBefore = 0;

const browser = () => typeof window !== 'undefined';

export function cacheKey(url: string) {
  const [path, query] = url.split('?');
  const params = new URLSearchParams(query);
  params.sort();
  return path + (params.size ? `?${params}` : '');
}

/** Call with the signed in person and company. A different one empties the cache. */
export function useCacheScope(next: string) {
  if (!browser() || next === scope) return;
  scope = next;
  entries.clear();
  inflight.clear();
}

export function readCache(key: string): CacheEntry | undefined {
  if (!browser()) return undefined;
  const entry = entries.get(key);
  if (entry && Date.now() - entry.at > KEEP_MS) { entries.delete(key); return undefined; }
  return entry;
}

export function isFresh(entry: CacheEntry | undefined) {
  return !!entry && entry.at > staleBefore && Date.now() - entry.at < FRESH_MS;
}

export function writeCache(key: string, data: unknown) {
  if (!browser()) return;
  entries.set(key, { data, at: Date.now() });
  listeners.get(key)?.forEach(notify => notify());
}

/** Fill a hole from data the server sent with the page. Never replaces what the browser already holds. */
export function seedCache(key: string, data: unknown) {
  if (!browser() || entries.has(key)) return;
  entries.set(key, { data, at: Date.now() });
}

export function dropCache(key: string) {
  if (!browser() || !entries.delete(key)) return;
  listeners.get(key)?.forEach(notify => notify());
}

export function subscribeCache(key: string, notify: () => void) {
  let set = listeners.get(key);
  if (!set) listeners.set(key, set = new Set());
  set.add(notify);
  return () => { set.delete(notify); if (!set.size) listeners.delete(key); };
}

/** Mark everything stale after a write here or in another tab. */
export function markCacheStale() {
  staleBefore = Date.now();
}

/** Two screens asking for the same URL at the same moment share one request. */
export function sharedLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = inflight.get(key) as Promise<T> | undefined;
  if (running) return running;
  const started = load().finally(() => { if (inflight.get(key) === started) inflight.delete(key); });
  inflight.set(key, started);
  return started;
}

/** For tests. */
export function resetCache() {
  entries.clear();
  inflight.clear();
  listeners.clear();
  staleBefore = 0;
  scope = '';
}

if (browser()) {
  window.addEventListener('groundwork-write', markCacheStale);
  try {
    const channel = new BroadcastChannel('groundwork-data');
    window.addEventListener('groundwork-write', () => channel.postMessage('write'));
    channel.addEventListener('message', markCacheStale);
  } catch { /* Older browsers: other tabs refresh on focus instead. */ }
}
