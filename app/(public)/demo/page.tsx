import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { DemoPicker } from '../../../components/public/demo-picker';
export const metadata: Metadata = { title: 'Try the demo' };
export default function Page() { return <div className="public-page"><BackLink /><div className="page-heading"><span className="eyebrow">Your private demo</span><h1>Choose your perspective.</h1><p>Explore the same fictional company through four roles. No Google sign-in needed.</p></div><DemoPicker /></div>; }
