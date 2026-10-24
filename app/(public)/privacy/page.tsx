import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { PrivacyNotice } from '../../../components/public/privacy-notice';
import { getSessionUserId } from '../../../lib/auth';
import { getPreferences } from '../../../lib/services/settings';
export const metadata: Metadata = { title: 'Privacy' };
export default async function Page() {
  const user = await getSessionUserId();
  const preferences = user ? await getPreferences(user, false) : undefined;
  // The notice has English and Gulf Arabic copy; all Arabic preferences use that translation.
  const arabic = typeof preferences?.language === 'string' && /^ar(-|$)/i.test(preferences.language);
  return <div className="public-page legal"><BackLink /><PrivacyNotice initialArabic={arabic} /></div>;
}
