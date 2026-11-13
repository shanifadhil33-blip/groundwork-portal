import { redirect } from 'next/navigation';
import { MyDay } from '../../../components/app/my-day';
import { getAppPageData } from '../../../lib/server-page-data';
import { navFor } from '../../../lib/ui/nav';

/** Today is the technician's screen. Everyone else has his own Home. */
export default async function Page() {
  const member = (await getAppPageData())?.me.memberships[0];
  if (member && member.role !== 'technician') redirect(navFor(member).home);
  return <MyDay />;
}
