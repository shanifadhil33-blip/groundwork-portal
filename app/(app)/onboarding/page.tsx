import { GuidedOnboarding } from '../../../components/app/guided-onboarding';
import { entryOnly } from '../../../lib/entry-redirect';
export default async function Page() { await entryOnly(); return <GuidedOnboarding />; }
