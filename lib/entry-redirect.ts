import 'server-only';
import { redirect } from 'next/navigation';
import { getAppPageData } from './server-page-data';
import { navFor } from './ui/nav';

/**
 * Company setup and joining are for a signed in person with no company.
 * Anyone who already has one goes to his Home. Demo people never join a company.
 * `allowReal` keeps "Add another company" working for real accounts.
 */
export async function entryOnly({ allowReal = false }: { allowReal?: boolean } = {}) {
  const app = await getAppPageData();
  const member = app?.me.memberships[0];
  if (!member) return;
  if (allowReal && !app?.me.user.is_demo) return;
  redirect(navFor(member).home);
}
