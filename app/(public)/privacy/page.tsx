import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { PrivacyNotice } from '../../../components/public/privacy-notice';
export const dynamic = 'error';
export const metadata: Metadata = { title: 'Privacy' };
export default function Page() { return <div className="public-page legal"><BackLink /><PrivacyNotice /></div>; }
