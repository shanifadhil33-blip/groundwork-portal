import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError, missing } from '../http';
import { LEARN_REPLIES, classifyCorrection, habitSuggestions, lessonImpact } from '../learn-habits';
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
  const scope = company || kind.company ? 'company' : 'personal';
  // LEARN12: high impact lessons from someone who is not an admin wait for an admin or owner yes.
  const impact = lessonImpact(words, scope === 'company');
  if (impact && actor.role !== 'admin') {
    await db.query("INSERT INTO lesson_proposals(workspace_id,proposed_by,proposed_by_name,body,scope,reason) VALUES($1,$2,(SELECT name FROM users WHERE id=$2),$3,$4,$5) ON CONFLICT (workspace_id,proposed_by,body) WHERE status='waiting' DO NOTHING", [ws, user, words, scope, impact]);
    return LEARN_REPLIES.waiting;
  }
  // The same stores the agent prompt and the Memory page already read, so "I will use this next time" is true.
  if (scope === 'company') await db.query('INSERT INTO company_rules(workspace_id,created_by,body) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM company_rules WHERE workspace_id=$1 AND body=$3)', [ws, user, words]);
  else await db.query('INSERT INTO personal_agent_learning(workspace_id,user_id,body) SELECT $1,$2,$3 WHERE NOT EXISTS (SELECT 1 FROM personal_agent_learning WHERE workspace_id=$1 AND user_id=$2 AND body=$3)', [ws, user, words]);
  return scope === 'company' ? LEARN_REPLIES.companySaved : LEARN_REPLIES.saved;
}
