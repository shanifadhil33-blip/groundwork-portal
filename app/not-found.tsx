import { getSessionUserId } from '../lib/auth';
import { SessionHeader } from '../components/public/session-header';
import { PageError } from '../components/ui/page-error';
export default async function NotFound() {
 const signedIn=!!await getSessionUserId();
 return <>{await SessionHeader()}<main><PageError title="We couldn’t open that page." message="The address may have changed, or you may not have access." home={signedIn?'/dashboard':'/'} homeLabel={signedIn?'Go to dashboard':'Back to home'}/></main></>;
}
