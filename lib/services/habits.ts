import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import { LEARN_REPLIES, classifyCorrection, habitSuggestions } from '../learn-habits';
import { hourInZone } from '../day-plan';
import { uuid } from './shared';

async function member(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string) {
  uuid.parse(ws);
  const m = (await db.query('SELECT role FROM members WHERE workspace_id=$1 AND user_id=$2 AND archived_at IS NULL', [ws, user])).rows[0];
  if (!m?.role) throw missing();
  const w = (await db.query('SELECT timezone FROM workspaces WHERE id=$1', [ws])).rows[0];
  return { role: m.role as string, tz: String(w?.timezone ?? 'Asia/Dubai') };
}

async function suggestionsFor(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string, tz: string) {
  const pref = (await db.query('SELECT usual_start, usual_areas FROM user_preferences WHERE user_id=$1', [user])).rows[0];
  const recent = (await db.query(`SELECT s.area FROM work_orders w JOIN sites s ON s.workspace_id=w.workspace_id AND s.id=w.site_id
    WHERE w.workspace_id=$1 AND w.assignee_id=$2 AND w.status='done' AND w.archived_at IS NULL AND s.area IS NOT NULL
    ORDER BY w.updated_at DESC LIMIT 30`, [ws, user])).rows.map(row => String(row.area));
  return habitSuggestions({
    usual_start: pref?.usual_start ? String(pref.usual_start).slice(0, 5) : null,
    usual_areas: (pref?.usual_areas ?? []) as string[],
    hour: hourInZone(new Date().toISOString(), tz),
    recentAreas: recent,
  });
}

/** Habit suggestions for the signed in person. Nothing is saved and nobody is notified. */
export async function getHabits(user: string, ws: string) {
  return withSystem(async db => {
    const actor = await member(db, user, ws);
    return { suggestions: await suggestionsFor(db, user, ws, actor.tz) };
  }, user);
}

const areaBody = z.object({ area: z.string().trim().min(1).max(40) }).strict();

/** Saves an area only when it is one of this person's own suggestions, computed again on the server. */
export async function rememberArea(user: string, ws: string, input: unknown) {
  const { area } = areaBody.parse(input);
  return withSystem(async db => {
    const actor = await member(db, user, ws);
    const fresh = await suggestionsFor(db, user, ws, actor.tz);
    const hit = fresh.find(item => item.area && item.area.toLowerCase() === area.toLowerCase());
    if (!hit?.area) throw new ApiError(422, 'validation', LEARN_REPLIES.notAHabit);
    const current = (await db.query('SELECT usual_areas FROM user_preferences WHERE user_id=$1', [user])).rows[0]?.usual_areas as string[] | undefined;
    const areas = [...(current ?? [])];
    if (!areas.some(saved => saved.toLowerCase() === hit.area!.toLowerCase()) && areas.length < 8) areas.push(hit.area);
    await db.query('INSERT INTO user_preferences(user_id) VALUES($1) ON CONFLICT DO NOTHING', [user]);
    await db.query('UPDATE user_preferences SET usual_areas=$2, updated_at=clock_timestamp() WHERE user_id=$1', [user, areas]);
    return { reply: LEARN_REPLIES.saved, usual_areas: areas };
  }, user);
}

/** A standing correction becomes a rule only after yes. A one time change is refused. Company rules are admin only. */
export async function saveLearnedRule(db: { query: (q: string, v?: unknown[]) => Promise<{ rows: any[] }> }, user: string, ws: string, rule: string, company: boolean) {
  const actor = await member(db, user, ws);
  const words = rule.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const kind = classifyCorrection(words);
  if (!kind || kind.kind === 'once') return LEARN_REPLIES.once;
  if (words.length > 300) return LEARN_REPLIES.tooLong;
  if ((company || kind.company) && actor.role !== 'admin') return LEARN_REPLIES.onlyAdmin;
  const scope = company || kind.company ? 'company' : 'personal';
  await db.query(`INSERT INTO learned_rules(workspace_id,user_id,scope,body) VALUES($1,$2,$3,$4)
    ON CONFLICT (workspace_id, user_id, body) DO NOTHING`, [ws, user, scope, words]);
  return scope === 'company' ? LEARN_REPLIES.companySaved : LEARN_REPLIES.saved;
}
