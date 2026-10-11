'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { request } from '../../lib/ui/api';
import { themes, type Theme } from '../../lib/ui/helpers';
function apply(theme: Theme) {
  try { localStorage.setItem('groundwork-theme', theme); } catch { /* Appearance still works when browser storage is unavailable. */ }
  document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
}
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => Promise<void>; sync: () => Promise<void>; error: string | null; saving: boolean }>({ theme: 'system', setTheme: async () => {}, sync: async () => {}, error: null, saving: false });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, update] = useState<Theme>('system'), [signedIn, setSignedIn] = useState(false), [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const pending = useRef(false);
  useEffect(() => { let stored: Theme | null = null; try { stored = localStorage.getItem('groundwork-theme') as Theme; } catch {} const initial = stored && themes.includes(stored) ? stored : 'system'; update(initial); apply(initial); }, []);
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const change = () => { if (theme === 'system') apply(theme); }; media.addEventListener('change', change); const storage = (event: StorageEvent) => { if (event.key === 'groundwork-theme' && themes.includes(event.newValue as Theme)) { update(event.newValue as Theme); apply(event.newValue as Theme); } }; window.addEventListener('storage', storage); return () => { media.removeEventListener('change', change); window.removeEventListener('storage', storage); }; }, [theme]);
  const sync = useCallback(async () => { if (pending.current) return; pending.current = true; setSaving(true); setSignedIn(true); setError(null); try { const preferences = await request<{ theme: Theme }>('/api/me/preferences'); update(preferences.theme); apply(preferences.theme); } catch { setError('We couldn’t load your appearance preference. Retry in Settings.'); } finally { pending.current = false; setSaving(false); } }, []);
  const setTheme = async (next: Theme) => { if (pending.current) return; const previous = theme; update(next); apply(next); setError(null); if (signedIn) { pending.current = true; setSaving(true); try { await request('/api/me/preferences', { method: 'PATCH', body: JSON.stringify({ theme: next }) }); } catch { update(previous); apply(previous); setError('We couldn’t save your appearance. Please try again.'); } finally { pending.current = false; setSaving(false); } } };
  return <Context.Provider value={{ theme, setTheme, sync, error, saving }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
