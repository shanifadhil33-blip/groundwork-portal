'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { isRtl } from '../../lib/languages';
import { isEnglish } from '../../lib/i18n';

const PublicWords = createContext<Record<string, string>>({});
const LegalPageRtl = createContext<((rtl: boolean) => void) | null>(null);
export function usePublicCopy() {
  const words = useContext(PublicWords);
  return (source: string) => words[source] ?? source;
}

/** Privacy and terms can show Gulf Arabic while the saved language stays left to right. */
export function useLegalPageRtl(rtl: boolean) {
  const set = useContext(LegalPageRtl);
  useEffect(() => {
    if (!set) return;
    set(rtl);
    return () => set(false);
  }, [rtl, set]);
}

export function PublicLanguage({ language, translations, children }: { language?: string; translations: Record<string, string>; children: ReactNode }) {
  const lang = language ? isEnglish(language) ? 'en' : language : undefined;
  const savedDir = language ? isRtl(language) ? 'rtl' : 'ltr' : undefined;
  const [legalRtl, setLegalRtl] = useState(false);
  const dir = legalRtl ? 'rtl' : savedDir;
  useEffect(() => {
    // Also apply on client navigation, when inline server scripts do not run again.
    // A signed out page has no saved direction, so leaving Arabic must restore left to right.
    document.documentElement.dir = dir ?? 'ltr';
    if (!lang || !dir) return;
    document.documentElement.lang = lang;
    delete document.documentElement.dataset.translating;
  }, [lang, dir]);
  return <LegalPageRtl.Provider value={setLegalRtl}><PublicWords.Provider value={translations}><div className="public-shell" lang={lang} dir={dir}>{children}</div></PublicWords.Provider></LegalPageRtl.Provider>;
}
