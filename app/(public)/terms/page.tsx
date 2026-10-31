import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { TermsNotice } from '../../../components/public/terms-notice';
import { isRtl } from '../../../lib/languages';
import { getPublicPageData } from '../../../lib/public-page-data';
export const metadata: Metadata = { title: 'Terms' };
export default async function Page() {
  const { language } = await getPublicPageData();
  const arabic = /^ar(-|$)/i.test(language ?? '');
  return <div className="public-page legal"><BackLink /><TermsNotice initialArabic={arabic} pageRtl={isRtl(language)} /></div>;
}
