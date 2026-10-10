'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { request, RequestError } from '../../lib/ui/api';
export function useResource<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null), [error, setError] = useState<RequestError | Error | null>(null), [loading, setLoading] = useState(true), generation = useRef(0);
  const load = useCallback(async () => { const run = ++generation.current; if (!url) { setData(null); setLoading(false); return; } setLoading(true); setError(null); try { const result = await request<T>(url); if (run === generation.current) setData(result); } catch (e) { if (run === generation.current) setError(e as Error); } finally { if (run === generation.current) setLoading(false); } }, [url]);
  useEffect(() => { setData(null); void load(); return () => { ++generation.current; }; }, [load]);
  return { data, error, loading, reload: load, setData };
}
