import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { DemoPicker } from '../../../components/public/demo-picker';
export const dynamic = 'error';
export const metadata: Metadata = { title: 'Try the demo' };
export default function Page() { return <div className="public-page demo-page"><BackLink /><div className="page-heading"><h1>Choose your perspective.</h1><p>Explore one sample company through four roles. No need to sign in with Google.</p></div><DemoPicker /></div>; }
