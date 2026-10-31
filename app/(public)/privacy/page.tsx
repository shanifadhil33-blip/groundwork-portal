import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { PrivacyNotice } from '../../../components/public/privacy-notice';
import { isRtl } from '../../../lib/languages';
import { getPublicPageData } from '../../../lib/public-page-data';
export const metadata: Metadata = { title: 'Privacy' };
export default async function Page() {
  const { language } = await getPublicPageData();
  // The notice has English and Gulf Arabic copy; all Arabic preferences use that translation.
  const arabic = language === 'ar-AE';
  return <div className="public-page legal"><BackLink /><PrivacyNotice initialArabic={arabic} pageRtl={isRtl(language)} /></div>;
}
