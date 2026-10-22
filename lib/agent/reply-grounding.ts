/** AGENT21: a cheap check of explicit record references, using only this turn's
 * successful tool results. This is deliberately not a general language verifier.
 * Questions and refusals can name a requested record without claiming it exists.
 */
export const RECORDS_FALLBACK = 'I could not find that in your records.';
type Evidence = { names: Set<string>; prices: Set<number>; counts: Set<number>; jobs: Map<number, unknown[]>; text: string[] };
type Mismatch = 'job' | 'name' | 'price' | 'date' | 'count';
const normalize = (s: string) => s.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, ' ').trim();
const digits = (s: string) => s.replace(/[٠-٩۰-۹०-९০-৯]/gu, d => String(d.charCodeAt(0) - ([0x660,0x6f0,0x966,0x9e6].find(n => d.charCodeAt(0) >= n && d.charCodeAt(0) <= n + 9) ?? 0)));

function evidence(values: unknown[]): Evidence {
 const out: Evidence = {names:new Set(),prices:new Set(),counts:new Set(),jobs:new Map(),text:[]};
 const walk = (value: unknown, key = '', depth = 0): void => {
  if (depth > 15 || value == null) return;
  if (Array.isArray(value)) { if (value.some(row => row && typeof row === 'object' && 'order_number' in row)) out.counts.add(value.length); for (const row of value) walk(row, key, depth + 1); return; }
  if (typeof value === 'object') {
   const row = value as Record<string, unknown>;
   if (typeof row.order_number === 'number') out.jobs.set(row.order_number, [...(out.jobs.get(row.order_number) ?? []), row]);
   for (const [k,v] of Object.entries(row)) if (!/(?:^id$|_id$|token|secret|password|email|phone)/i.test(k)) walk(v, k, depth + 1);
  } else if (typeof value === 'number') {
   if (/amount|price|cost|charge|fee/.test(key)) out.prices.add(value);
   if (/total|count|completed|finished|done|open|late|unread|suggested_jobs/.test(key)) out.counts.add(value);
  }
  else if (typeof value === 'string') {
   out.text.push(normalize(digits(value)));
   if (/name|nickname|title/.test(key)) {
    out.names.add(normalize(value));
    for (const part of value.split(/\s+/u)) out.names.add(normalize(part));
   }
   if (/^\d+(?:\.\d+)?$/.test(value)) {
    if (/amount|price|cost|charge|fee/.test(key)) out.prices.add(Number(value));
    if (/total|count|completed|finished|done/.test(key)) out.counts.add(Number(value));
   }
  }
 };
 for (const value of values) walk(value);
 return out;
}

/** Failed results, user messages, model arguments and earlier replies are not evidence. */
export function recordResults(results: unknown[]): unknown[] {
 return results.flatMap(result => {
  const r = result as {isError?:boolean;structuredContent?:{result?:unknown};content?:{text?:string}[]} | null;
  if (!r || r.isError) return [];
  if (r.structuredContent && Object.hasOwn(r.structuredContent,'result')) return [r.structuredContent.result];
  try { return [JSON.parse(r.content?.[0]?.text ?? '')]; } catch { return []; }
 });
}

const person = "([\\p{Lu}][\\p{L}’']*(?:[ \\t]+[\\p{Lu}][\\p{L}’']*)*)";
const ordinarySubjects = new Set(['he','i','you','we','they','it','who','what','this','that','someone','everyone','nobody','nothing','everything','there','here','status','price','payment','approval','agent','the agent','groundwork','today','tomorrow','monday','tuesday','wednesday','thursday','friday','saturday','sunday']);
const namePatterns = [
 new RegExp(`(?:[Aa]ssigned to|[Bb]ooked with|[Tt]echnician|[Ww]orker|[Ff]rom|[Aa]sk|[Cc]ontact)\\s+${person}`, 'gu'),
 new RegExp(`\\b${person}\\s+(?:has|have|completed|finished|is|was|will|works)\\b`, 'gu'),
];
const months = 'January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec';
const dates = new RegExp(`\\b(?:\\d{4}-\\d{2}-\\d{2}|\\d{1,2} (?:${months})(?: \\d{4})?|(?:${months}) \\d{1,2}(?:,? \\d{4})?)\\b`, 'gi');
function dateKey(text: string): string {
 // Parse calendar dates without the server timezone shifting them to the day before.
 if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
 const month = text.match(/[a-z]+/i)?.[0].slice(0,3).toLowerCase();
 const index = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(month ?? '');
 const numbers = text.match(/\d+/g) ?? [];
 if (index < 0 || !numbers.length) return normalize(text);
 return `${numbers[1] ?? ''}-${String(index + 1).padStart(2,'0')}-${numbers[0]!.padStart(2,'0')}`;
}

export function groundedReply(reply: string, results: unknown[], knownNames: string[] = []): string {
 const values = recordResults(results), all = evidence(values);
 const trustedNames = new Set(knownNames.filter(Boolean).map(normalize));
 const counts: Partial<Record<Mismatch,number>> = {};
 // Keep punctuation, decimal prices, line breaks and markdown destinations intact.
 const sentences = reply.split(/(?<=[.!?؟।。])(?=\s|$)|(?<=\n)/u);
 const fixed = sentences.map(sentence => {
  const plain = digits(sentence.replace(/\]\([^)]*\)/g,']').replace(/[*_`]/g,''));
  if (!plain.trim() || (/^[\s•]*(?:what|which|where|when|who|how|do you mean|did you mean|shall|should|would|could|can|is it|are you)\b/i.test(plain) && /[?؟]\s*$/.test(plain)) || /\b(?:could not find|cannot find|can't find|no record|not found|please (?:give|provide|check)|can(?:not|'t) (?:change|assign|update))\b/i.test(plain)) return sentence;
  const bad = new Set<Mismatch>();
  const jobs = [...plain.matchAll(/\b(?:WO|work order|job)\s*#?\s*(\d+)\b/gi)].map(m => Number(m[1]));
  for (const n of jobs) if (!all.jobs.has(n)) bad.add('job');
  // A price or visit date on one job must not borrow another job's values.
  const scoped = jobs.length ? evidence(jobs.flatMap(n => all.jobs.get(n) ?? [])) : all;
  for (const pattern of namePatterns) for (const match of plain.matchAll(pattern)) {
   const name = normalize(match[1]);
   if (!ordinarySubjects.has(name) && !all.names.has(name) && !trustedNames.has(name)) bad.add('name');
  }
  for (const match of plain.matchAll(/\b(?:AED|USD|INR|EUR|GBP|SAR|QAR|OMR|KWD|BHD|PKR|BDT|NPR|KES|UGX|NGN|GHS|ETB|SOS|CNY|PHP)\s*([\d,]+(?:\.\d+)?)/gi)) {
   if (!scoped.prices.has(Number(match[1].replace(/,/g,'')))) bad.add('price');
  }
  for (const match of plain.matchAll(dates)) {
   const date = dateKey(match[0]);
   if (!scoped.text.some(t => t.includes(normalize(match[0])) || t.includes(date))) bad.add('date');
  }
  for (const match of plain.matchAll(/\b(\d+)\s+(?:(?:open|late|completed|finished|done|new|scheduled|unread|suggested)\s+)?(?:jobs?|work orders?|messages?|requests?|people|workers?|technicians?)\b/gi)) {
   if (!all.counts.has(Number(match[1]))) bad.add('count');
  }
  if (!bad.size) return sentence;
  for (const kind of bad) counts[kind] = (counts[kind] ?? 0) + 1;
  return `${sentence.match(/^\s*/u)?.[0] ?? ''}${RECORDS_FALLBACK}${sentence.match(/\s*$/u)?.[0] ?? ''}`;
 }).join('');
 // Never log model prose, tool payloads, names, job numbers or other record data.
 if (Object.keys(counts).length) console.warn('[assistant] record mismatch', counts);
 return fixed;
}
