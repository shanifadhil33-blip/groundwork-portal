'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PublicHeader, PublicFooter } from './chrome';
import { PageError } from '../ui/page-error';
import { Translator } from '../app/translator';
import { LANGUAGES, type Language } from '../../lib/languages';

const WORDS = ['We couldn’t open that page.', 'The link may be old, or this page needs you to sign in.', 'Sign in', 'Back to home'] as const;
function browserLanguage() {
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const want of preferred) {
    const code = want.toLowerCase();
    const hit = LANGUAGES.find(l => l.code.toLowerCase() === code)
      ?? LANGUAGES.find(l => l.code.toLowerCase().split('-')[0] === code.split('-')[0]);
    if (hit) return hit;
  }
  return null;
}

export function NotFoundBody() {
  // Resolve the session on the client so this boundary keeps static pages static.
  const [signedIn, setSignedIn] = useState<boolean>();
  const [words, setWords] = useState<Partial<Record<typeof WORDS[number], string>>>({});
  const [lang, setLang] = useState<Language | null>(null);

  useEffect(() => {
    let active = true;
    void fetch('/api/session', { cache: 'no-store' })
      .then(r => r.ok ? r.json() : null)
      .then(session => { if (active) setSignedIn(session?.signedIn === true); })
      .catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (signedIn !== false) return;
    const language = browserLanguage();
    if (!language || language.code.startsWith('en')) return;
    let active = true;
    // Visitors use only the shipped words, never the signed in translation service.
    void fetch(`/i18n/${language.code}.json`)
      .then(r => r.ok ? r.json() : null)
      .then(value => {
        if (!active || !value || typeof value !== 'object' || Array.isArray(value)) return;
        const translated = Object.fromEntries(WORDS.flatMap(key =>
          typeof value[key] === 'string' && value[key].trim() ? [[key, value[key]]] : []));
        setWords(translated);
        setLang(language);
      })
      .catch(() => { /* Keep the English actions available when the file is unavailable. */ });
    return () => { active = false; };
  }, [signedIn]);

  if (signedIn) return <><PublicHeader signedIn /><main><PageError title="We couldn’t open that page." message="The address may have changed, or you may not have access." home="/dashboard" homeLabel="Go to dashboard" brand={false} /></main><Translator /></>;
  const t = (key: typeof WORDS[number]) => words[key] ?? key;
  return (
    <div className="lost-page" lang={lang?.code ?? 'en'} dir={lang?.rtl ? 'rtl' : 'ltr'}>
      <PublicHeader signedIn={false} />
      <main className="lost-main">
        <section className="lost-card" aria-labelledby="lost-title">
          <span className="lost-mark" aria-hidden="true">?</span>
          <h1 id="lost-title">{t('We couldn’t open that page.')}</h1>
          <p>{t('The link may be old, or this page needs you to sign in.')}</p>
          <div className="lost-actions">
            <Link className="button primary" href="/sign-in">{t('Sign in')}</Link>
            <Link className="button secondary" href="/">{t('Back to home')}</Link>
          </div>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
}
