'use client';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { isRtl } from '../../lib/languages';
import { isEnglish } from '../../lib/i18n';

const PublicWords = createContext<Record<string, string>>({});
export function usePublicCopy() {
  const words = useContext(PublicWords);
  return (source: string) => words[source] ?? source;
}

export function PublicLanguage({ language, translations, children }: { language?: string; translations: Record<string, string>; children: ReactNode }) {
  const lang = language ? isEnglish(language) ? 'en' : language : undefined;
  const dir = language ? isRtl(language) ? 'rtl' : 'ltr' : undefined;
  useEffect(() => {
    if (!lang || !dir) return;
    // Also apply on client navigation, when inline server scripts do not run again.
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    delete document.documentElement.dataset.translating;
  }, [lang, dir]);
  return <PublicWords.Provider value={translations}><div className="public-shell" lang={lang} dir={dir}>{children}</div></PublicWords.Provider>;
}
