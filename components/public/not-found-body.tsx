'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PublicHeader, PublicFooter } from './chrome';
import { PageError } from '../ui/page-error';
import { Translator } from '../app/translator';
import { LANGUAGES } from '../../lib/languages';
// Signed in people see this screen in their own language (Oct 21: it stayed English in Arabic).
// Signed out visitors (ds14) get a calm Desert Stone screen in their browser language from the saved word files, no AI call, with Sign in first.
// Client-resolved session so the root not-found boundary never forces static pages to render dynamically.
const WORDS = ['We couldn’t open that page.', 'The link may be old, or this page needs you to sign in.', 'Sign in', 'Back to home'] as const;
function browserLanguage() {
  for (const want of navigator.languages ?? [navigator.language]) {
    const w = want.toLowerCase(); if (w.startsWith('en')) return null;
    const hit = LANGUAGES.find(l => l.code.toLowerCase() === w) ?? LANGUAGES.find(l => l.code.toLowerCase().split('-')[0] === w.split('-')[0]);
    if (hit) return hit;
  }
  return null;
}
export function NotFoundBody() {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [words, setWords] = useState<Record<string, string>>({}); const [lang, setLang] = useState<{ code: string; rtl?: boolean } | null>(null);
  useEffect(() => { let active = true; void fetch('/api/session', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(session => { if (active) setSignedIn(session?.signedIn === true); }).catch(() => { if (active) setSignedIn(false); }); return () => { active = false; }; }, []);
  useEffect(() => { if (signedIn !== false) return; const l = browserLanguage(); if (!l || l.code.startsWith('en')) return; void fetch(`/i18n/${l.code}.json`).then(r => r.ok ? r.json() : null).then(j => { if (j) { setWords(j); setLang(l); } }).catch(() => {}); }, [signedIn]);
  if (signedIn) return <><PublicHeader signedIn /><main><PageError title="We couldn’t open that page." message="The address may have changed, or you may not have access." home="/dashboard" homeLabel="Go to dashboard" brand={false} /></main><Translator /></>;
  const t = (k: typeof WORDS[number]) => words[k] ?? k;
  return <div className="lost-page" lang={lang?.code} dir={lang?.rtl ? 'rtl' : undefined}><PublicHeader signedIn={false} /><main className="lost-main"><section className="lost-card"><span className="lost-mark" aria-hidden="true">?</span><h1>{t('We couldn’t open that page.')}</h1><p>{t('The link may be old, or this page needs you to sign in.')}</p><div className="lost-actions"><Link className="button primary" href="/sign-in">{t('Sign in')}</Link><Link className="button secondary" href="/">{t('Back to home')}</Link></div></section></main><PublicFooter /></div>;
}
