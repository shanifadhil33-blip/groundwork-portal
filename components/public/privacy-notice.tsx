'use client';
import { useState } from 'react';
import { privacyNotice } from '../../lib/ui/privacy-notice';
export function PrivacyNotice() {
  const [arabic, setArabic] = useState(false);
  return <div className="privacy-notice stack" lang={arabic ? 'ar-AE' : 'en'} dir={arabic ? 'rtl' : 'ltr'} data-no-translate>
    <div className="row" role="group" aria-label={arabic ? 'لغة الإشعار' : 'Notice language'}>
      <button className="button secondary" lang="en" aria-pressed={!arabic} onClick={() => setArabic(false)}>English</button>
      <button className="button secondary" lang="ar-AE" aria-pressed={arabic} onClick={() => setArabic(true)}>العربية</button>
    </div>
    <div className="page-heading"><h1>{arabic ? 'الخصوصية وبياناتك' : 'Privacy and your data'}</h1><p>{arabic ? 'آخر تحديث 23 أكتوبر 2026' : 'Last updated 23 October 2026'}</p></div>
    <article>{privacyNotice.map(([title, titleAr, body, bodyAr]) => <section key={title}><h2>{arabic ? titleAr : title}</h2><p>{arabic ? bodyAr : body}</p></section>)}</article>
  </div>;
}
