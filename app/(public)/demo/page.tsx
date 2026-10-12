import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { DemoPicker } from '../../../components/public/demo-picker';
export const dynamic = 'error';
export const metadata: Metadata = { title: 'Try the demo' };
export default function Page() { return <div className="public-page demo-page"><BackLink /><div className="page-heading"><h1>Pick a person to try.</h1><p>See the same company as each person. No sign in needed.</p></div><DemoPicker /></div>; }
