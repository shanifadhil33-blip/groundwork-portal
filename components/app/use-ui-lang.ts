'use client';
import { useSyncExternalStore } from 'react';

/** The screen language from <html lang>. English during server render and hydration, then the person's language,
 * and it follows a language change (the Translator sets <html lang>). Used to write dates in that language. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
}
export function useUiLang(): string {
  return useSyncExternalStore(subscribe, () => document.documentElement.lang || 'en-IN', () => 'en-IN');
}
