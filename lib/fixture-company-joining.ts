import type { PoolClient } from 'pg';
import type { ids as fixtureIds } from './fixture';
import { practiceCompanyJoinScope } from './company-join-rehearsal';

/** Fictional form defaults, restored by new sandbox creation and reset. No join request is issued. */
export async function populateCompanyJoiningFixture(db:PoolClient,ids:typeof fixtureIds) {
 const live=(await db.query('SELECT id FROM workspaces WHERE id=$1 AND is_demo AND demo_expires_at>now()',[ids.ridgeline])).rows[0];
 if(!live)return;
 await db.query('INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5)',[
  ids.faisal,practiceCompanyJoinScope(ids.ridgeline),'details','preview',
  JSON.stringify({name:'Yusuf',phone:'+971000000000',address:'Flat 14, Sample Court',note:'',kind:'household'}),
 ]);
}
