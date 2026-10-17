import { z } from 'zod';
import { LANGUAGES } from './languages';

export const isEnglish = (lang: string) => /^en(?:-|$)/i.test(lang);
export const translationRequest = z.object({
  lang: z.enum(LANGUAGES.map(l => l.code) as [string, ...string[]]),
  strings: z.array(z.string().min(1).max(500)).max(200),
  /** Saved translations only, no AI call: the screen fills at once and the rest follows. */
  cached_only: z.boolean().optional(),
}).strict();
export const TRANSLATION_ATTRIBUTES = ['placeholder', 'aria-label', 'title', 'alt', 'data-label'] as const;
export const TRANSLATION_SKIP = 'script,style,code,pre,textarea,[data-no-translate],[contenteditable]:not([contenteditable="false"])';

// Keep spacing and split long replies into pieces accepted by the API.
export function translationPieces(text: string): string[] {
  const tokens = [...text.matchAll(protectedPattern)];
  const pieces: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + 500, text.length);
    if (end < text.length) {
      const space = text.slice(start, end).search(/\s+\S*$/);
      if (space > 0) end = start + space;
      // Never split a placeholder, number, identifier or email address.
      const token = tokens.find(t => t.index < end && t.index + t[0].length > end);
      if (token) end = token.index > start ? token.index : token.index + token[0].length;
      // Keep surrogate pairs intact at the length boundary.
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    }
    pieces.push(text.slice(start, end));
    start = end;
  }
  return pieces;
}
export function translationSource(text: string): string | null {
  const source = text.trim();
  return source && source.length <= 500 && /\p{L}/u.test(source) ? source : null;
}
export function replaceTranslation(text: string, translations: Record<string, string>): string {
  return translationPieces(text).map(piece => {
    const source = translationSource(piece);
    return source && Object.hasOwn(translations, source)
      ? piece.replace(source, () => translations[source]) : piece;
  }).join('');
}
const protectedPattern = /\{\{[^{}]+\}\}|\{[^{}]+\}|\$\{[^{}]+\}|%\d*\$?[sdif]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b[A-Za-z]+(?:-[A-Za-z]+)*-\d+\b|\d+(?:[.,:/-]\d+)*/g;
export function protectedTokens(text: string): string[] { return text.match(protectedPattern) ?? []; }
export function validTranslation(source: string, translated: unknown): translated is string {
  if (typeof translated !== 'string' || !translated.trim() || translated.length > 4000) return false;
  const expected = protectedTokens(source).sort(), actual = protectedTokens(translated).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) return false;
  // Dashes in identifiers, email addresses and dates are data and must remain.
  return !/\p{Pd}/u.test(translated.replace(protectedPattern, ''));
}
/** Numbers stay as 0 to 9 so they match the data on screen (models often write ६ or ৬ or ۶). */
const NATIVE_DIGITS = /[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0BE6-\u0BEF\u0D66-\u0D6F\u1369-\u1371]/g;
const DIGIT_BASES = [0x0660, 0x06F0, 0x0966, 0x09E6, 0x0BE6, 0x0D66];
export function asciiDigits(text: string): string {
  return text.replace(NATIVE_DIGITS, ch => { const c = ch.codePointAt(0)!; if (c >= 0x1369) return String(c - 0x1368); const base = DIGIT_BASES.find(b => c >= b && c <= b + 9)!; return String(c - base); });
}
export function parseTranslations(text: string, sources: string[]): Record<string, string> | null {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = Object.create(null);
  for (const source of sources) {
    const raw = Object.hasOwn(value, source) ? (value as Record<string, unknown>)[source] : undefined;
    const translated = typeof raw === 'string' ? asciiDigits(raw) : raw;
    if (validTranslation(source, translated)) out[source] = translated.trim();
  }
  return Object.keys(out).length ? out : null;
}
export function readTranslationCache(raw: string | null): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [source, translated] of Object.entries(value).slice(-5000)) {
        if (translationSource(source) && validTranslation(source, translated)) out[source] = translated;
      }
    }
  } catch { /* A broken or unavailable cache must not prevent navigation. */ }
  return out;
}
