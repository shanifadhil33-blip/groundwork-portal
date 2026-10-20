/** LEARN08 suggestions and LEARN09 rules. A one time change is never stored. */

export const LEARN_REPLIES = {
  ask: 'Should I remember this?',
  once: 'I will not remember that. It was a one time change.',
  saved: 'Saved. I will use this next time.',
  companySaved: 'Saved for the whole company.',
  onlyAdmin: 'Only an admin can save a rule for the whole company. Nothing was saved.',
  waiting: 'This changes how the company works, so I sent it to your admin for a yes. I will use it once they say yes.',
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

// Only a sentence that starts with standing words is a rule. Ordinary questions ("the AC always leaks", "never mind", "I am off just today") never reach this.
const ONCE = /^(?:just this once|only this once|this time only|one time only)\b/i;
const RULE = /^(?:from now on|always|every time)\b|^never (?!mind\b)/i;
const COMPANY = /\b(?:for the company|for everyone|company wide)\b/i;

/** A single job move is not a rule. Standing words ask first. One time words are refused. */
export function classifyCorrection(text: string): { kind: 'once' } | { kind: 'ask'; rule: string; company: boolean } | null {
  const words = text.normalize('NFC').trim().replace(/\s+/gu, ' ');
  if (!words || words.length > 300) return null;
  if (ONCE.test(words)) return { kind: 'once' };
  if (!RULE.test(words)) return null;
  return { kind: 'ask', rule: words, company: COMPANY.test(words) };
}

// LEARN12: a lesson is high impact when it is for the whole company or touches money, safety or clients. Then a person who
// is not an admin only proposes it, and an admin or owner says yes first.
const MONEY = /\b(?:price|prices|pay|paid|payment|discount|refund|invoice|bill|charge|free of charge|aed)\b/i;
const SAFETY = /\b(?:safety|safe|gas|isolate|isolation|live wire|shock|ladder|permit|breaker|mains)\b/i;
const CLIENTS = /\b(?:client|clients|customer|customers|tenant|tenants|household|households)\b/i;
export function lessonImpact(rule: string, company: boolean): 'company' | 'money' | 'safety' | 'clients' | null {
  if (company) return 'company';
  if (SAFETY.test(rule)) return 'safety';
  if (MONEY.test(rule)) return 'money';
  if (CLIENTS.test(rule)) return 'clients';
  return null;
}
