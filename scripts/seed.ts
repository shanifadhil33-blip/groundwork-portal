import { populateFixture } from '../lib/fixture';
import type { PoolClient } from 'pg';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { runOwner } from './migrate';
export { ids,siteId,orderId } from '../lib/fixture';
import { ids,siteId,orderId } from '../lib/fixture';
export async function seed(client: PoolClient,supplierSandbox=false) {
 await client.query('BEGIN');
 try {
  // Development fixture reset: deliberate owner-only TRUNCATE, including auth data.
  await client.query('TRUNCATE demo_creation_attempts,workspaces,clients,members,sites,work_orders,comments,invites,imports,import_rows,supplier_orders,supplier_events,audit_log,notifications,work_order_events,users,accounts,sessions,verification_token CASCADE');
  await populateFixture(client,ids,siteId,orderId,false,supplierSandbox);
  await client.query('COMMIT');
 } catch(error) { await client.query('ROLLBACK'); throw error; }
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) { await runOwner(seed); console.log('Seed reset and inserted.'); }
