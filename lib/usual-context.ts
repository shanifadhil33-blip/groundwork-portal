/** LEARN05: usual areas and usual start time, kept for this person only. Times stay on the hour from 6 to 8. */
export const USUAL_REPLIES = {
  start: 'Remember your usual start?',
  areas: 'Remember these usual areas?',
  saved: 'Saved. Your Memory page shows it.',
  badStart: 'Usual start is on the hour from six in the morning to eight in the evening.',
  badAreas: 'Tell me up to eight area names.',
} as const;

export type UsualAsk = { start?: string; areas?: string[] };

const HOURS = new Set(['06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20']);

export function hourLabel(value: string) { return value.slice(0, 5); }

function clock(hour: string) {
  const n = Number(hour);
  if (!Number.isInteger(n) || n < 0 || n > 23) return null;
  const hh = String(n).padStart(2, '0');
  return HOURS.has(hh) ? `${hh}:00` : null;
}

export function readUsualAsk(text: string): UsualAsk | null {
  const words = text.normalize('NFC').trim().replace(/[.!?؟]+$/u, '').replace(/\s+/gu, ' ');
  const start = /^(?:i )?(?:usually )?start at (\d{1,2})(?::00)?(?: now)?$/i.exec(words)
    || /^أبدأ(?: الساعة)?\s*(\d{1,2})$/.exec(words);
  const areaLine = /^(?:my )?usual areas are (.+)$/i.exec(words) || /^i usually work in (.+)$/i.exec(words) || /^مناطقي المعتادة (.+)$/.exec(words);
  if (!start && !areaLine) return null;
  const out: UsualAsk = {};
  if (start) {
    const parsed = clock(start[1]);
    if (!parsed) return { start: '' };
    out.start = parsed;
  }
  if (areaLine) {
    const areas = areaLine[1].split(/\s*(?:,| and | و )\s*/u).map(part => part.trim()).filter(Boolean);
    out.areas = areas;
  }
  return out;
}

export function usualValid(ask: UsualAsk) {
  if (ask.start === '' || (ask.start != null && !/^(?:0[6-9]|1\d|20):00$/.test(ask.start))) return USUAL_REPLIES.badStart;
  if (ask.areas && (ask.areas.length < 1 || ask.areas.length > 8 || ask.areas.some(area => area.length > 40))) return USUAL_REPLIES.badAreas;
  return null;
}
