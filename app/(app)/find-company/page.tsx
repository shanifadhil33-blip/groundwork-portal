import { FindCompany } from '../../../components/app/company-joining';
import { entryOnly } from '../../../lib/entry-redirect';
export default async function Page() { await entryOnly({ allowReal: true }); return <FindCompany />; }
