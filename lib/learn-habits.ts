/** LEARN08 suggestions and LEARN09 rules. A one time change is never stored. */

export const LEARN_REPLIES = {
  ask: 'Should I remember this?',
  once: 'I will not remember that. It was a one time change.',
  saved: 'Saved. I will use this next time.',
  companySaved: 'Saved for the whole company.',
  onlyAdmin: 'Only an admin can save a rule for the whole company. Nothing was saved.',
  usualStart: 'Your usual start is coming up.',
  usualAreas: 'You usually work in these areas.',
  rememberArea: 'Remember this area',
  notAHabit: 'That area is not one you keep working in. Nothing was saved.',
  tooLong: 'Keep the rule to one short sentence.',
} as const;

export type HabitSuggestion = { id: string; text: string; area?: string };

export function habitSuggestions(input: { usual_start: string | null; usual_areas: string[]; hour: number; recentAreas: string[] }): HabitSuggestion[] {
  const out: HabitSuggestion[] = [];
  if (input.usual_start) {
    const start = Number(input.usual_start.slice(0, 2));
    if (Number.isFinite(start) && input.hour >= start - 2 && input.hour <= start) out.push({ id: 'start', text: LEARN_REPLIES.usualStart });
  }
  if (input.usual_areas.length) out.push({ id: 'areas', text: LEARN_REPLIES.usualAreas });
  const counts = new Map<string, number>();
  for (const area of input.recentAreas) {
    const name = area.trim();
    if (!name || input.usual_areas.some(saved => saved.toLowerCase() === name.toLowerCase())) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  const [area, count] = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  if (area && count >= 3 && input.usual_areas.length < 8) out.push({ id: `area:${area}`, text: LEARN_REPLIES.rememberArea, area });
  return out;
}

const ONCE = /\b(?:just this once|only this once|not this time|this time only|only this job|just today|one time only)\b/i;
const RULE = /\b(?:always|from now on|never|every time|remember this|remember that)\b/i;
const COMPANY = /\b(?:for the company|for everyone|company wide)\b/i;

/** A single job move is not a rule. Standing words ask first. One time words are refused. */
export function classifyCorrection(text: string): { kind: 'once' } | { kind: 'ask'; rule: string; company: boolean } | null {
  const words = text.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!words || words.length > 300) return null;
  if (ONCE.test(words)) return { kind: 'once' };
  if (!RULE.test(words)) return null;
  return { kind: 'ask', rule: words, company: COMPANY.test(words) };
}
