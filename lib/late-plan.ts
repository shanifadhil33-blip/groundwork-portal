// Top 10 moment 8: for a late job the Agent drafts a new time and a backup person. Nothing moves until Yes.
/** Next working day at 09:00 in the company time zone, as an ISO instant. working days: 0 Sunday to 6 Saturday. */
export function nextSlot(now: Date, tz: string, workingDays: number[] = [1, 2, 3, 4, 5], hour = 9) {
  const offsetMin = (d: Date) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d).map(x => [x.type, x.value])); return (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) - d.getTime()) / 60000; };
  const local = new Date(now.getTime() + offsetMin(now) * 60000);
  for (let i = 1; i <= 14; i++) {
    const d = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + i, hour));
    if (!workingDays.length || workingDays.includes(d.getUTCDay())) { const guess = new Date(d.getTime() - offsetMin(d) * 60000); return new Date(d.getTime() - offsetMin(guess) * 60000).toISOString(); }
  }
  return new Date(now.getTime() + 86400000).toISOString();
}
export type Worker = { user_id: string; name: string | null; off?: unknown; trade_match?: boolean; area_match?: boolean; today?: number };
/** Pick a main person and a backup from the ranked list, never the current assignee, never someone off. */
export function latePlan(workers: Worker[], current: string | null) {
  const ok = workers.filter(w => w.user_id !== current && !w.off);
  const why = (w: Worker) => [w.trade_match && 'right trade', w.area_match && 'works this area', `${w.today ?? 0} jobs today`].filter(Boolean).join(', ');
  return ok.length ? { main: ok[0], backup: ok[1] ?? null, why: why(ok[0]) } : null;
}
