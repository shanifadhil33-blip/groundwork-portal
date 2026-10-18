'use client';
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';

const ServerLang = createContext('en-IN');
export function ServerLangProvider({language, children}: {language?:string;children:ReactNode}) {
  return createElement(ServerLang.Provider, {value:language??'en-IN'}, children);
}
/** Use the server preference during SSR and hydration, then follow the Translator's html language. */
function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
  return () => observer.disconnect();
}
export function useUiLang(): string {
  const serverLanguage = useContext(ServerLang);
  return useSyncExternalStore(subscribe, () => document.documentElement.lang || 'en-IN', () => serverLanguage);
}
