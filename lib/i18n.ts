import { interfaceTranslation } from './ui-translation-templates';
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
export function replaceTranslation(text: string, translations: Record<string, string>, demo = false): string {
  return translationPieces(text).map(piece => {
    const source = translationSource(piece);
    const translated = source ? interfaceTranslation(source, translations, demo) : undefined;
    return source && translated !== undefined ? piece.replace(source, () => translated) : piece;
  }).join('');
}
const protectedPattern = /\{\{[^{}]+\}\}|\{[^{}]+\}|\$\{[^{}]+\}|%\d*\$?[sdif]|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b[A-Za-z]+(?:-[A-Za-z]+)*-\d+\b|\d+(?:[.,:/-]\d+)*/g;
export function protectedTokens(text: string): string[] { return text.match(protectedPattern) ?? []; }
/** Languages whose spelling joins parts of a word with a hyphen (Igbo na-eme, Filipino I-save, Yoruba, Hausa, Somali). */
export const WORD_HYPHEN_LANGS = new Set(['ig', 'fil', 'yo', 'ha', 'so']);
/** Models often write a code or a word hyphen as ‐ or ‑; inside a word it is the plain hyphen. */
export function plainHyphens(text: string): string { return text.replace(/(?<=[\p{L}\p{N}])[\u2010\u2011](?=[\p{L}\p{N}])/gu, '-'); }
export function validTranslation(source: string, translated: unknown, lang?: string): translated is string {
  if (typeof translated !== 'string' || !translated.trim() || translated.length > 4000) return false;
  const expected = protectedTokens(source).sort(), actual = protectedTokens(translated).sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) return false;
  // Dashes in identifiers, email addresses and dates are data and must remain.
  let rest = translated.replace(protectedPattern, '');
  // A hyphen inside a word is spelling in these languages, not a dash. Spaced dashes are still refused.
  if (lang && WORD_HYPHEN_LANGS.has(lang)) rest = rest.replace(/(?<=\p{L})-(?=\p{L})/gu, '');
  return !/\p{Pd}/u.test(rest);
}
/** Numbers stay as 0 to 9 so they match the data on screen (models often write ६ or ৬ or ۶). */
const NATIVE_DIGITS = /[\u0660-\u0669\u06F0-\u06F9\u0966-\u096F\u09E6-\u09EF\u0BE6-\u0BEF\u0D66-\u0D6F\u1369-\u1371]/g;
const DIGIT_BASES = [0x0660, 0x06F0, 0x0966, 0x09E6, 0x0BE6, 0x0D66];
export function asciiDigits(text: string): string {
  return text.replace(/(?<=[\d\u0660-\u0669\u06F0-\u06F9])\u066B(?=[\d\u0660-\u0669\u06F0-\u06F9])/g, '.').replace(/(?<=[\d\u0660-\u0669\u06F0-\u06F9])\u066C(?=[\d\u0660-\u0669\u06F0-\u06F9])/g, ',').replace(NATIVE_DIGITS, ch => { const c = ch.codePointAt(0)!; if (c >= 0x1369) return String(c - 0x1368); const base = DIGIT_BASES.find(b => c >= b && c <= b + 9)!; return String(c - base); });
}
/** The script each language is written in. A model sometimes answers Malayalam in Devanagari ("सुप्रभातम्"); such a
 * translation is refused. Latin letters are always allowed (names, codes, brand words). */
const SCRIPTS: Record<string, RegExp> = { 'ar-AE': /\p{Script=Arabic}/u, ur: /\p{Script=Arabic}/u, ps: /\p{Script=Arabic}/u, 'fa-AF': /\p{Script=Arabic}/u, 'fa-IR': /\p{Script=Arabic}/u,
  hi: /\p{Script=Devanagari}/u, ne: /\p{Script=Devanagari}/u, bn: /\p{Script=Bengali}/u, ml: /\p{Script=Malayalam}/u, ta: /\p{Script=Tamil}/u,
  am: /\p{Script=Ethiopic}/u, ti: /\p{Script=Ethiopic}/u, 'zh-CN': /\p{Script=Han}/u };
export function rightScript(text: string, lang?: string): boolean {
  const script = lang ? SCRIPTS[lang] : undefined;
  if (!script) return true;
  for (const ch of text.match(/\p{L}/gu) ?? []) if (!/\p{Script=Latin}|\p{Script=Common}|\p{Script=Inherited}/u.test(ch) && !script.test(ch)) return false;
  return true;
}
export function parseTranslations(text: string, sources: string[], lang?: string): Record<string, string> | null {
  let value: unknown;
  try { value = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: Record<string, string> = Object.create(null);
  for (const source of sources) {
    const raw = Object.hasOwn(value, source) ? (value as Record<string, unknown>)[source] : undefined;
    const translated = typeof raw === 'string' ? plainHyphens(asciiDigits(raw)) : raw;
    if (validTranslation(source, translated, lang) && rightScript(translated, lang)) out[source] = translated.trim();
  }
  return Object.keys(out).length ? out : null;
}
export function readTranslationCache(raw: string | null, lang?: string): Record<string, string> {
  const out: Record<string, string> = Object.create(null);
  try {
    const value: unknown = JSON.parse(raw ?? '{}');
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [source, translated] of Object.entries(value).slice(-5000)) {
        if (translationSource(source) && validTranslation(source, translated, lang) && rightScript(translated, lang)) out[source] = translated;
      }
    }
  } catch { /* A broken or unavailable cache must not prevent navigation. */ }
  return out;
}
/** LANG01: interface text ships in language files, one per language (public/i18n/<code>.json, written by e2e/export-language-files.mjs). */
export const languageFileUrl = (lang: string) => `/i18n/${encodeURIComponent(lang)}.json`;
/** Adds the language file's words to the cache. The file wins over machine words saved in this browser, because files are what native speakers review. Returns how many words changed. */
export function mergeLanguageFile(cache: Record<string, string>, raw: string | null, lang: string): number {
  if (isEnglish(lang)) return 0;
  let changed = 0;
  for (const [source, translated] of Object.entries(readTranslationCache(raw, lang))) {
    if (cache[source] !== translated) { cache[source] = translated; changed++; }
  }
  return changed;
}
