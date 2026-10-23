import { DEFAULT_LANGUAGE, LANGUAGES } from '../languages';
import { LANG_HINT_KEY } from '../head-scripts';

/** Keep the viewer's language when entering or switching a demo, before the home renders. */
export function demoLanguage(current?: string) {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANG_HINT_KEY); } catch { /* Storage may be disabled. */ }
  const preferred = current ? [current] : [saved, ...(navigator.languages?.length ? navigator.languages : [navigator.language])];
  for (const value of preferred) {
    if (!value) continue;
    const code = value.toLowerCase();
    const hit = LANGUAGES.find(l => l.code.toLowerCase() === code)
      ?? LANGUAGES.find(l => l.code.toLowerCase().split('-')[0] === code.split('-')[0]);
    if (hit) return hit.code;
  }
  return DEFAULT_LANGUAGE;
}
