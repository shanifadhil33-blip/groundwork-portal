'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useInitialResource } from './initial-resources';
import { request, RequestError } from '../../lib/ui/api';
export function useResource<T>(url: string | null) {
  const initial=useInitialResource(url);
  const initialError=initial&&'error' in initial?new RequestError(initial.error.status,initial.error.message,initial.error.fields,initial.error.code):null;
  const [data, setData] = useState<T | null>(()=>initial&&'data' in initial?initial.data as T:null), [error, setError] = useState<RequestError | Error | null>(initialError), [loading, setLoading] = useState(!initial), generation = useRef(0);
  const load = useCallback(async () => { const run = ++generation.current; if (!url) { setData(null); setLoading(false); return; } setLoading(true); setError(null); try { const result = await request<T>(url); if (run === generation.current) setData(result); } catch (e) { if (run === generation.current) setError(e as Error); } finally { if (run === generation.current) setLoading(false); } }, [url]);
  useEffect(() => {
    const seed=initial;
    if(seed) {setData('data' in seed?seed.data as T:null);setError('error' in seed?new RequestError(seed.error.status,seed.error.message,seed.error.fields,seed.error.code):null);setLoading(false);}
    else {setData(null);void load();}
    return () => { ++generation.current; };
  }, [load,url,initial]);
  useEffect(()=>{const retry=()=>{void load();};window.addEventListener('groundwork-retry-resources',retry);return()=>window.removeEventListener('groundwork-retry-resources',retry);},[load]);
  return { data, error, loading, reload: load, setData };
}
