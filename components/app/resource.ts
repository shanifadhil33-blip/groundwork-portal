'use client';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type SetStateAction } from 'react';
import { useInitialResource } from './initial-resources';
import { request, RequestError } from '../../lib/ui/api';
import { cacheKey, dropCache, isFresh, readCache, seedCache, sharedLoad, subscribeCache, writeCache, type CacheEntry } from '../../lib/ui/resource-cache';

const noop = () => () => {};

/**
 * Read one API resource.
 * Shows cached or server sent data at once and refreshes it in the background when it is stale,
 * so a screen visited before never shows a skeleton again. `loading` is only true while there
 * is nothing at all to show.
 */
export function useResource<T>(url: string | null) {
  const seed = useInitialResource(url);
  const key = url ? cacheKey(url) : null;
  const seedEntry = useMemo<CacheEntry | undefined>(() => (seed && 'data' in seed ? { data: seed.data, at: 0 } : undefined), [seed]);
  if (key && seedEntry) seedCache(key, seedEntry.data);

  const subscribe = useCallback((notify: () => void) => (key ? subscribeCache(key, notify) : noop()), [key]);
  const entry = useSyncExternalStore(subscribe, () => (key ? readCache(key) : undefined), () => seedEntry);

  const seedError = seed && 'error' in seed ? seed.error : null;
  const [failure, setFailure] = useState<{ key: string | null; error: RequestError | Error } | null>(() => (seedError ? { key, error: new RequestError(seedError.status, seedError.message, seedError.fields, seedError.code) } : null));
  const [pending, setPending] = useState<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = ++generation.current;
    if (!url || !key) return;
    setPending(key);
    setFailure(null);
    try {
      const result = await sharedLoad(key, () => request<T>(url));
      writeCache(key, result);
    } catch (e) {
      const status = e instanceof RequestError ? e.status : 0;
      // No access any more, or the record is gone: stop showing the old copy.
      if (status === 403 || status === 404) dropCache(key);
      // A background refresh that fails keeps what is on screen. Only an empty screen shows the error.
      if (run === generation.current && !readCache(key)) setFailure({ key, error: e as Error });
    } finally {
      if (run === generation.current) setPending(null);
    }
  }, [url, key]);

  useEffect(() => {
    if (!key) return;
    if (seedError && !readCache(key)) return;
    if (!isFresh(readCache(key))) void load();
    return () => { ++generation.current; };
  }, [key, load, seedError]);

  useEffect(() => {
    const retry = () => { void load(); };
    window.addEventListener('groundwork-retry-resources', retry);
    return () => window.removeEventListener('groundwork-retry-resources', retry);
  }, [load]);

  const setData = useCallback((next: SetStateAction<T | null>) => {
    if (!key) return;
    const current = (readCache(key)?.data ?? null) as T | null;
    const value = typeof next === 'function' ? (next as (old: T | null) => T | null)(current) : next;
    if (value === null) dropCache(key); else writeCache(key, value);
  }, [key]);

  const data = (entry?.data ?? null) as T | null;
  const error = failure && failure.key === key ? failure.error : null;
  // Until the first effect runs, a URL with nothing cached and no error is about to load.
  const loading = !!key && data === null && !error && (pending === key || pending === null);
  return { data, error, loading, reload: load, setData };
}
