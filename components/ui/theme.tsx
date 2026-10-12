'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { themes, type Theme } from '../../lib/ui/helpers';
function apply(theme: Theme) {
  try { localStorage.setItem('groundwork-theme', theme); } catch { /* Appearance still works when browser storage is unavailable. */ }
  document.documentElement.dataset.theme = theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme;
}
const Context = createContext<{ theme: Theme; setTheme: (theme: Theme) => Promise<void>; sync: () => Promise<void>; error: string | null; saving: boolean }>({ theme: 'light', setTheme: async () => {}, sync: async () => {}, error: null, saving: false });
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, update] = useState<Theme>('light'), [error, setError] = useState<string | null>(null), saving = false;
  useEffect(() => { let stored: Theme | null = null; try { stored = localStorage.getItem('groundwork-theme') as Theme; } catch {} const initial = stored && themes.includes(stored) ? stored : 'light'; update(initial); apply(initial); }, []);
  useEffect(() => { const media = matchMedia('(prefers-color-scheme: dark)'); const change = () => { if (theme === 'system') apply(theme); }; media.addEventListener('change', change); const storage = (event: StorageEvent) => { if (event.key === 'groundwork-theme' && themes.includes(event.newValue as Theme)) { update(event.newValue as Theme); apply(event.newValue as Theme); } }; window.addEventListener('storage', storage); return () => { media.removeEventListener('change', change); window.removeEventListener('storage', storage); }; }, [theme]);
  // The theme is remembered on this device only (Light, Dark, Match my phone); it never follows the account.
  const sync = useCallback(async () => { setError(null); }, []);
  const setTheme = async (next: Theme) => { update(next); apply(next); setError(null); };
  return <Context.Provider value={{ theme, setTheme, sync, error, saving }}>{children}</Context.Provider>;
}
export const useTheme = () => useContext(Context);
