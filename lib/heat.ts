// CMP07: Gulf summer midday work bans. Outdoor jobs in the ban hours get flagged so the day plan moves them.
type Rule = { from: [number, number]; to: [number, number]; start: number; end: number }; // month/day range, minutes from midnight
const RULES: Record<string, Rule> = {
  AE: { from: [6, 15], to: [9, 15], start: 12 * 60 + 30, end: 15 * 60 },
  SA: { from: [6, 15], to: [9, 15], start: 12 * 60, end: 15 * 60 },
  QA: { from: [6, 1], to: [9, 15], start: 10 * 60, end: 15 * 60 + 30 },
  KW: { from: [6, 1], to: [8, 31], start: 11 * 60, end: 16 * 60 },
  BH: { from: [7, 1], to: [8, 31], start: 12 * 60, end: 16 * 60 },
  OM: { from: [6, 1], to: [8, 31], start: 12 * 60 + 30, end: 15 * 60 + 30 },
};
const OUTDOOR = /\b(roof|rooftop|outdoor|outside|exterior|external|facade|façade|garden|landscap\w*|lawn|irrigation|sprinkler line|pool|parking|car park|gate|fence|boundary wall|terrace|balcony|chiller yard|condenser|outdoor unit|solar|water tank|satellite|street ?light)\b|سطح|حديقة|مسبح|خارجي/i;
export function isOutdoor(job: { title?: string | null; trade?: string | null; description?: string | null }) {
  return OUTDOOR.test([job.title, job.trade, job.description].filter(Boolean).join(' '));
}
const hm = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
/** The ban window for this country on this local date, or null outside summer or outside the Gulf. */
export function heatWindow(country: string | null | undefined, month: number, day: number) {
  const r = RULES[(country ?? 'AE').toUpperCase()]; if (!r) return null;
  const v = month * 100 + day; if (v < r.from[0] * 100 + r.from[1] || v > r.to[0] * 100 + r.to[1]) return null;
  return { start: r.start, end: r.end, label: `${hm(r.start)} to ${hm(r.end)}` };
}
function local(at: Date, tz: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(at).map(x => [x.type, x.value]));
  return { month: +p.month, day: +p.day, minutes: +p.hour * 60 + +p.minute };
}
/** Plain words for the team when an outdoor job sits in the midday ban, else null. */
export function heatWarning(job: { title?: string | null; trade?: string | null; description?: string | null; scheduled_for?: string | Date | null }, tz: string, country?: string | null) {
  if (!job.scheduled_for || !isOutdoor(job)) return null;
  const l = local(new Date(job.scheduled_for), tz), w = heatWindow(country, l.month, l.day);
  if (!w || l.minutes < w.start || l.minutes >= w.end) return null;
  return `Outdoor job in the midday heat break (${w.label}). Move it to the morning or late afternoon.`;
}
/** Order a day so outdoor jobs come first while it is cool, keeping time order inside each group. */
export function heatOrder<T extends { title?: string | null; trade?: string | null; description?: string | null; scheduled_for?: string | Date | null }>(jobs: T[], tz: string, country?: string | null): (T & { heat_warning: string | null; outdoor: boolean })[] {
  return jobs.map(j => ({ ...j, outdoor: isOutdoor(j), heat_warning: heatWarning(j, tz, country) }));
}
