'use client';
import { useState } from 'react';

const MAIL = 'shanifadhil022@gmail.com';
const terms = [
  ['A portfolio project', 'مشروع لعرض الأعمال',
    'Groundwork is a portfolio project by Adhil Shanif. It is free and offered as it is, with no promise that it will always be online or keep your data forever. Please keep your own copy of anything important.',
    'Groundwork مشروع لعرض الأعمال من إعداد عادل شنيف. المشروع مجاني ومتوفر بحالته الحالية، من دون وعد بأنه بيظل متاح على الإنترنت دايماً أو بيحتفظ ببياناتك للأبد. يرجى الاحتفاظ بنسخة عندك من أي شيء مهم.'],
  ['Use it fairly', 'استخدمه بإنصاف',
    'Only add information you are allowed to share. Do not try to see other companies’ data, get around the access rules, or overload the demo.',
    'أضف بس المعلومات المسموح لك بمشاركتها. لا تحاول تطّلع على بيانات شركات ثانية، أو تتجاوز قواعد الوصول، أو تحمّل النسخة التجريبية فوق طاقتها.'],
  ['Your data', 'بياناتك',
    <>Your company’s data stays yours. How we store it and how to delete it is in our <a href="/privacy">Privacy</a> page.</>,
    <>بيانات شركتك تظل ملكك. طريقة تخزينها وحذفها موجودة في صفحة <a href="/privacy">الخصوصية</a> عندنا.</>],
  ['Agent', 'المساعد',
    'The agent can be wrong. Check what it suggests. It only changes anything after you confirm.',
    'المساعد ممكن يخطئ. راجع اقتراحاته. ما يغيّر أي شيء إلا بعد تأكيدك.'],
  ['Questions', 'الأسئلة',
    <>Email <a href={`mailto:${MAIL}`}>{MAIL}</a>.</>,
    <>راسلنا على <a href={`mailto:${MAIL}`}>{MAIL}</a>.</>],
] as const;

export function TermsNotice({ initialArabic = false }: { initialArabic?: boolean }) {
  const [arabic, setArabic] = useState(initialArabic);
  return <div className="terms-notice stack" lang={arabic ? 'ar-AE' : 'en'} dir={arabic ? 'rtl' : 'ltr'} data-no-translate>
    <div className="row" role="group" aria-label={arabic ? 'لغة الشروط' : 'Terms language'}>
      <button className="button secondary" lang="en" aria-pressed={!arabic} onClick={() => setArabic(false)}>English</button>
      <button className="button secondary" lang="ar-AE" aria-pressed={arabic} onClick={() => setArabic(true)}>العربية</button>
    </div>
    <div className="page-heading"><h1>{arabic ? 'الشروط' : 'Terms'}</h1><p>{arabic ? 'آخر تحديث 12 أكتوبر 2026' : 'Last updated 12 October 2026'}</p></div>
    <article>{terms.map(([title, titleAr, body, bodyAr]) => <section key={title}><h2>{arabic ? titleAr : title}</h2><p>{arabic ? bodyAr : body}</p></section>)}</article>
  </div>;
}
