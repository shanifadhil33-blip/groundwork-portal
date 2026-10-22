import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { PRACTICE_TOKEN, practiceInviteScope } from './identity-rehearsal';

/** A receipt only, in the existing sandbox scratch store. No invite or credential is issued. */
export async function populateIdentityFixture(db: PoolClient, ids: typeof fixtureIds) {
  const expires = (await db.query('SELECT demo_expires_at FROM workspaces WHERE id=$1 AND is_demo', [ids.ridgeline])).rows[0]?.demo_expires_at;
  if (!expires) return;
  const id = randomUUID();
  await db.query('INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5)', [ids.imran, practiceInviteScope(ids.ridgeline), id, 'preview', JSON.stringify({
    id, workspace_id: ids.ridgeline, email: 'yusuf@harbor.example', role: 'client', client_id: ids.harbor, client_name: 'Harbor & Pine Coworking', client_kind: 'manager', status: 'pending', expires_at: new Date(expires).toISOString(), created_at: new Date().toISOString(), simulated: true, token: PRACTICE_TOKEN,
  })]);
}
