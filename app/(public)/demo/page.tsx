import type { Metadata } from 'next';
import { BackLink } from '../../../components/public/chrome';
import { DemoPicker } from '../../../components/public/demo-picker';
export const metadata: Metadata = { title: 'Try the demo' };
export default function Page() {
  return <div className="public-page demo-page"><BackLink label="Back" /><div className="page-heading"><h1>Try Groundwork with sample data</h1><p>This is a made up company called Ridgeline Facility Services. Pick a person to see the app through his eyes. Nothing you do here is real or sent to anyone. It resets every 6 hours.</p></div><DemoPicker /></div>;
}
