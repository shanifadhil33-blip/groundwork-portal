import { afterAll, expect, it } from 'vitest';
import { closePools, withSystem } from '../lib/db';
import { ids } from '../scripts/seed';
import { getPreferences, patchPreferences } from '../lib/services/settings';
import { partOfDay } from '../components/app/greeting';
afterAll(async () => { await withSystem(db => db.query('UPDATE user_preferences SET preferred_name=NULL,name_asked_at=NULL WHERE user_id=ANY($1)', [[ids.ravi, ids.sam]])); await closePools(); });
it('LEARN01: saving a name marks it asked; Not now marks it asked without a name', async () => {
  await withSystem(db => db.query('UPDATE user_preferences SET preferred_name=NULL,name_asked_at=NULL WHERE user_id=ANY($1)', [[ids.ravi, ids.sam]]));
  expect((await getPreferences(ids.ravi)).name_asked_at).toBeNull();
  const r = await patchPreferences(ids.ravi, { preferred_name: 'Ravi bhai' }); expect(r.preferred_name).toBe('Ravi bhai'); expect(r.name_asked_at).not.toBeNull();
  const s = await patchPreferences(ids.sam, { name_asked: true }); expect(s.preferred_name).toBeNull(); expect(s.name_asked_at).not.toBeNull();
  await expect(patchPreferences(ids.ravi, { preferred_name: '<script>' })).rejects.toThrow();
});
it('greets by time of day', () => { expect(partOfDay(8)).toBe('Good morning'); expect(partOfDay(14)).toBe('Good afternoon'); expect(partOfDay(20)).toBe('Good evening'); });
