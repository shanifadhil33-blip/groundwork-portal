'use client';
import { useState } from 'react';
import { useLegalPageRtl } from './language';
import { termsNoticeArabic } from '../../lib/terms-notice-ar';

const MAIL = 'shanifadhil022@gmail.com';
const terms = [
  ['What this is', termsNoticeArabic[0].title,
    'Groundwork is free and offered as it is, with no promise that it will always be online or keep your data forever. Please keep your own copy of anything important.', termsNoticeArabic[0].body],
  ['Use it fairly', termsNoticeArabic[1].title,
    'Only add information you are allowed to share. Do not try to see other companies’ data, get around the access rules, or overload the demo.', termsNoticeArabic[1].body],
  ['Your data', termsNoticeArabic[2].title,
    <>Your company’s data stays yours. How we store it and how to delete it is in our <a href="/privacy">Privacy</a> page.</>, termsNoticeArabic[2].body],
  ['Agent', termsNoticeArabic[3].title,
    'The agent can be wrong. Check what it suggests. It only changes anything after you confirm.', termsNoticeArabic[3].body],
  ['Questions', termsNoticeArabic[4].title,
    <>Email <a href={`mailto:${MAIL}`}>{MAIL}</a>.</>, termsNoticeArabic[4].body],
] as const;

export function TermsNotice({ initialArabic = false, pageRtl = false }: { initialArabic?: boolean; pageRtl?: boolean }) {
  const [arabic, setArabic] = useState(initialArabic);
  useLegalPageRtl(arabic);
  const rtl = arabic || pageRtl;
  return <div className="terms-notice stack" lang={arabic ? 'ar-AE' : 'en'} dir={rtl ? 'rtl' : 'ltr'} data-no-translate>
    <div className="row" role="group" aria-label={arabic ? 'لغة الشروط' : 'Terms language'}>
      <button className="button secondary" lang="en" aria-pressed={!arabic} onClick={() => setArabic(false)}>English</button>
      <button className="button secondary" lang="ar-AE" aria-pressed={arabic} onClick={() => setArabic(true)}>العربية</button>
    </div>
    <div className="page-heading"><h1>{arabic ? 'الشروط' : 'Terms'}</h1><p>{arabic ? 'آخر تحديث 12 أكتوبر 2026' : 'Last updated 12 October 2026'}</p></div>
    <article>{terms.map(([title, titleAr, body, bodyAr]) => <section key={title}><h2>{arabic ? titleAr : title}</h2><p>{arabic ? bodyAr : body}</p></section>)}</article>
  </div>;
}
