import { NoCompany } from '../../../components/app/no-company';
import { entryOnly } from '../../../lib/entry-redirect';
/** Only for a signed in person with no company. Setup for a new company lives on Home, never as a forced wizard. */
export default async function Page() { await entryOnly(); return <NoCompany />; }
