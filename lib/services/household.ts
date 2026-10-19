import { detectEmergency } from '../emergency';
import { visitChargeFor } from './visit-charge';
import { householdFields, HOUSEHOLD_SINCE_CHOICES, HOUSEHOLD_WHERE_CHOICES } from '../agent/household';
import { z } from 'zod';
import { ApiError, invalid } from '../http';
import { inWorkspace, uuid, type Context } from './shared';
import { createSuggestion } from './suggestions';

const draftSchema = z.object({
 visit_charge: z.object({amount:z.number().nullable(),currency:z.string(),sample:z.boolean()}).optional(),
 words: z.string().min(1).max(19000), site_id: uuid.optional(),
 where: z.string().max(300).optional(), since: z.string().max(300).optional(),
 asked: z.array(z.enum(['site', 'where', 'since'])).max(3),
 step: z.enum(['site', 'where', 'since', 'photo', 'confirm']),
 photo_ids: z.array(uuid).max(4),
});
type Draft = z.infer<typeof draftSchema>;
type Site = { id: string; name: string };

const locations = /\b(?:under (?:the )?sink|kitchen|bathroom|bedroom|living room|balcony|hall|toilet|roof|garden|garage)\b|മുറി|അടുക്കള|കുളിമുറി|المطبخ|الحمام|الغرفة|غرفة/iu;
const durations = /\b(?:today|yesterday|since\s+[^,.!?\n]+|(?:a few|\d+|two|three|several)\s+(?:days?|weeks?|months?)(?:\s+ago)?|longer)\b|ഇന്ന്|ഇന്നലെ|ദിവസമായി|اليوم|أمس|منذ[^،.؟\n]*/iu;
const report = /\b(?:not cooling|not working|won.t|broken|leak\w*|dripp\w*|water under|report a problem|raise a request|create a request)\b|തണു|വെള്ളം|ചോർ|പ്രശ്നം|يبر[دذ]|تسرب|ماء|مياه|مشكلة/iu;
// A status question ("is my leak fixed?", "when is the technician coming") is not a new problem.
const statusQuestion = /[?؟]\s*$|^\s*(?:what|when|where|who|how|is|are|has|did|does|show|list|cancel|move|reschedule|confirm|approve|decline)\b/iu;
function extract(d: Draft, text: string, sites: Site[]) {
 d.site_id ??= sites.find(s => text.toLocaleLowerCase().includes(s.name.toLocaleLowerCase()))?.id;
 d.where ??= text.match(locations)?.[0];
 d.since ??= text.match(durations)?.[0];
}
function next(d: Draft, sites: Site[]) {
 if (!d.site_id && sites.length === 1) d.site_id = sites[0].id;
 const step = !d.site_id && sites.length > 1 ? 'site' : !d.where ? 'where' : !d.since ? 'since' : 'photo';
 d.step = step;
 if (step !== 'photo' && !d.asked.includes(step)) d.asked.push(step);
}
function question(d: Draft, sites: Site[]) {
 if (d.step === 'site') return { reply: 'Which home is this for?', choices: sites.map(s => s.name) };
 if (d.step === 'where') return { reply: 'Where in your home is the problem?', choices: HOUSEHOLD_WHERE_CHOICES };
 if (d.step === 'since') return { reply: 'Since when has this been happening?', choices: HOUSEHOLD_SINCE_CHOICES };
 return { reply: 'You can add a photo or skip it.', choices: ['Skip photo'], household_photo: true };
}

/** Server owned progress survives remounts and never trusts the chat transcript as state. */
export async function householdIntake(user: string, ws: string, messages: {role: string; content: string}[], photoIds?: string[], force = false) {
 const words = messages.filter(m => m.role === 'user').at(-1)?.content ?? '';
 return inWorkspace(user, ws, async c => {
  if (c.role !== 'client' || c.client_kind !== 'household') return null;
  await c.db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([ws, user, 'household'])]);
  const a = (await c.db.query("SELECT * FROM assistant_actions WHERE workspace_id=$1 AND user_id=$2 AND tool='household_intake' AND consumed_at IS NULL AND declined_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1 FOR UPDATE", [ws, user])).rows[0];
  const asksPrice = /\b(?:how much|cost|price|charge|fee)\b|كم|سعر|تكلفة|رسوم|എത്ര|ചാർജ്|വില/iu.test(words);
  const asksStatus = /\b(?:status|is (?:it|my .+) fixed|technician coming|when (?:is|will|does)|(?:has|was|is) .+ paid|(?:where|show|find|check) .*(?:invoice|quote|request|job))\b|حالة|موعد|എപ്പോൾ/iu.test(words);
  if (!force && asksPrice && !asksStatus && !detectEmergency(words)) {
   const sites: Site[] = (await c.db.query('SELECT id,name FROM sites WHERE workspace_id=$1 AND client_id=$2 AND archived_at IS NULL ORDER BY name,id',[ws,c.client_id])).rows;
   const site=sites.find(s=>words.toLocaleLowerCase().includes(s.name.toLocaleLowerCase()))?.id ?? a?.args?.site_id ?? (sites.length===1?sites[0].id:null);
   const charge=await visitChargeFor(c,site);
   return {available:true,reply:charge.amount==null ? "The office will confirm the price. I won't guess it." : `The visit charge is ${charge.currency} ${charge.amount.toFixed(2)}. The full price depends on what the technician finds. He will tell you before any extra work.`};
  }
  if (!a && !force && (!report.test(words) || statusQuestion.test(words))) return null;
  // He moved on mid intake (asked something else): drop the draft quietly and answer normally.
  if (a && a.tool === 'household_intake' && !force && statusQuestion.test(words) && (a.args?.step === 'where' || a.args?.step === 'since' || a.args?.step === 'photo')) {
   await c.db.query('UPDATE assistant_actions SET declined_at=now() WHERE id=$1', [a.id]);
   return null;
  }
  if (!a && /^\s*(?:report a problem|raise a request|create a request)[.!]?\s*$/i.test(words)) return { available: true, reply: 'Tell me what is happening in your home.' };
  const sites: Site[] = (await c.db.query('SELECT id,name FROM sites WHERE workspace_id=$1 AND client_id=$2 AND archived_at IS NULL ORDER BY name,id', [ws, c.client_id])).rows;
  if (!sites.length) return { available: true, reply: 'Ask the company to add your home before sending a request.' };
  const d: Draft = a ? draftSchema.parse(a.args) : { words, asked: [], step: 'photo', photo_ids: [] };
  if (a) {
   if (d.step === 'site') {
    const site = sites.find(s => s.name.toLocaleLowerCase() === words.trim().toLocaleLowerCase());
    if (!site) return { available: true, reply: 'Tap a home from the choices.', choices: sites.map(s => s.name) };
    d.site_id = site.id;
   } else if (d.step === 'where') d.where = words;
   else if (d.step === 'since') d.since = words;
   else if (d.step === 'photo') {
    if (!photoIds && words !== 'Skip photo') return { available: true, ...question(d, sites) };
    d.photo_ids = photoIds ?? [];
    if (d.photo_ids.length) {
     const photos = (await c.db.query('SELECT id FROM shared_photos WHERE workspace_id=$1 AND uploaded_by=$2 AND suggestion_id IS NULL AND id=ANY($3::uuid[])', [ws, user, d.photo_ids])).rows;
     if (photos.length !== new Set(d.photo_ids).size) throw invalid('Choose your own photos.');
    }
    d.step = 'confirm';
   }
  }
  extract(d, words, sites);
  if (d.step !== 'confirm') next(d, sites);
  draftSchema.parse(d);
  if(d.step==='confirm')d.visit_charge=await visitChargeFor(c,d.site_id??null);
  const fields = householdFields(d.words, d.where, d.since);
  const summary = `${fields.title}\n${d.words}\nHome: ${sites.find(s => s.id === d.site_id)?.name ?? 'Please tell the company'}\nWhere: ${d.where ?? 'Not given'}\nSince: ${d.since ?? 'Not given'}\nPhoto: ${d.photo_ids.length ? 'Yes' : 'No'}`;
  const tool = d.step === 'confirm' ? 'household_request' : 'household_intake';
  const id = a?.id ?? (await c.db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [ws, user, tool, JSON.stringify(d), summary.slice(0,600), 'Your own words for the company.'])).rows[0].id;
  if (a) await c.db.query("UPDATE assistant_actions SET tool=$2,args=$3,summary=$4,expires_at=now()+interval '10 minutes' WHERE id=$1", [id, tool, JSON.stringify(d), summary.slice(0,600)]);
  // The card shows app labels in his language and his own words untouched, so it gets the parts, not only the summary.
  const fieldsOut = { title: fields.title, words: d.words, home: sites.find(s => s.id === d.site_id)?.name ?? null, where: d.where ?? null, since: d.since ?? null, photos: d.photo_ids.length, visit_charge: d.visit_charge };
  return d.step === 'confirm' ? { available: true, pending_action: { id, tool, summary, household: true, words: d.words, fields: fieldsOut, why: 'Nothing is sent until you tap Yes.' } } : { available: true, ...question(d, sites) };
 });
}

export async function confirmHousehold(c: Context, a: {id: string; args: unknown}) {
 if (c.role !== 'client' || c.client_kind !== 'household') throw invalid('This request is for a household.');
 const d = draftSchema.parse(a.args);
 if (d.step !== 'confirm' || !d.site_id) throw new ApiError(409, 'incomplete', 'Finish the request first.');
 const request = await createSuggestion(c.user, c.ws, { ...householdFields(d.words, d.where, d.since), site_id: d.site_id, photo_ids: d.photo_ids }, undefined, a.id, undefined, false, d);
 await c.db.query("UPDATE assistant_actions SET consumed_at=now(),outcome='done',after=$2::jsonb WHERE id=$1", [a.id, JSON.stringify(request)]);
 return { available: true, reply: 'Your request was sent. The company will confirm a time.', logged: true };
}
