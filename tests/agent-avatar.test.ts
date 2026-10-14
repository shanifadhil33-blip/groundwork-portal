import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { patchPreferences } from '../lib/services/settings';
import { AVATARS } from '../lib/avatars';
afterAll(async () => { await withSystem(db => db.query('UPDATE user_preferences SET agent_avatar=NULL WHERE user_id=$1', [ids.ravi])); await closePools(); });
it('LEARN20: picks an avatar from robots, animals and icons only', async () => {
  expect((await patchPreferences(ids.ravi, { agent_avatar: 'cat' })).agent_avatar).toBe('cat');
  await expect(patchPreferences(ids.ravi, { agent_avatar: 'face' })).rejects.toThrow();
  for (const a of AVATARS) expect(a).not.toMatch(/face|person|user|man|woman|smile/);
});
