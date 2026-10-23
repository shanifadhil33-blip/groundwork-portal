import { joinNames } from './ui/name-joins';

/**
 * LANG04: every language a person can pick, for the searchable dropdown at sign up and in the profile.
 * English (India) is the default for everyone, and every user can change his own language at any time.
 * Search works on the English name and the name in the language's own script. rtl flips the layout for that user only.
 */
export type Language = { code: string; name: string; native: string; group: string; rtl?: boolean };
export const DEFAULT_LANGUAGE = 'en-IN';
export const LANGUAGES: Language[] = [
  { code: 'en-IN', name: 'English (India)', native: 'English (India)', group: 'English' },
  { code: 'en-US', name: 'English (US)', native: 'English (US)', group: 'English' },
  { code: 'en-GB', name: 'English (UK)', native: 'English (UK)', group: 'English' },
  { code: 'ar-AE', name: 'Gulf Arabic', native: 'العربية الخليجية', group: 'Arabic', rtl: true },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', group: 'South Asia' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', group: 'South Asia' },
  { code: 'ur', name: 'Urdu', native: 'اردو', group: 'South Asia', rtl: true },
  { code: 'bn', name: 'Bangla (Bengali)', native: 'বাংলা', group: 'South Asia' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', group: 'South Asia' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', group: 'South Asia' },
  { code: 'ps', name: 'Pashto', native: 'پښتو', group: 'Afghanistan', rtl: true },
  { code: 'fa-AF', name: 'Dari', native: 'دری', group: 'Afghanistan', rtl: true },
  { code: 'fa-IR', name: 'Farsi (Persian)', native: 'فارسی', group: 'Middle East', rtl: true },
  { code: 'fil', name: 'Filipino (Tagalog)', native: 'Filipino', group: 'East and Southeast Asia' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', native: '简体中文', group: 'East and Southeast Asia' },
  { code: 'sw-KE', name: 'Swahili (Kenya)', native: 'Kiswahili', group: 'Africa: Kenya' },
  { code: 'am', name: 'Amharic', native: 'አማርኛ', group: 'Africa: Ethiopia' },
  { code: 'ti', name: 'Tigrinya', native: 'ትግርኛ', group: 'Africa: Eritrea' },
  { code: 'so', name: 'Somali', native: 'Soomaali', group: 'Africa: Somalia' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá', group: 'Africa: Nigeria' },
  { code: 'ha', name: 'Hausa', native: 'Hausa', group: 'Africa: Nigeria' },
  { code: 'ig', name: 'Igbo', native: 'Igbo', group: 'Africa: Nigeria' },
  { code: 'lg', name: 'Luganda', native: 'Luganda', group: 'Africa: Uganda' },
  { code: 'tw', name: 'Twi', native: 'Twi', group: 'Africa: Ghana' },
];
export const isRtl = (code?: string | null) => !!LANGUAGES.find(l => l.code === (code ?? DEFAULT_LANGUAGE))?.rtl;
/** Searchable dropdown filter: English name, own script name or code, any case. */
export function searchLanguages(q: string) { const s = q.trim().toLowerCase(); return s ? LANGUAGES.filter(l => [l.name, l.native, l.code].some(v => v.toLowerCase().includes(s))) : LANGUAGES; }

/** LANG02: how ready each language is. Ready = English, written and checked. Early = machine translated, not yet checked by a native speaker (LANG05 raises languages to Checked). */
const VOICE_EARLY = new Set(['ti', 'yo', 'ha', 'ig', 'lg', 'tw', 'so']);
export function languageQuality(code: string): 'Ready' | 'Early' { return code.startsWith('en') ? 'Ready' : 'Early'; }
export function languageVoice(code: string): 'Voice' | 'Voice early' { return VOICE_EARLY.has(code) ? 'Voice early' : 'Voice'; }
/** Options for the Language dropdown: grouped by region, searchable by English name, own script, code or region, with quality and voice shown. */
export function languageOptions(join: typeof joinNames = joinNames) {
  return LANGUAGES.map(l => ({ value: l.code, noTranslate: true, group: l.group, label: l.native === l.name ? l.name : join([l.name, l.native]), hint: `${languageQuality(l.code)} · ${languageVoice(l.code)}`, keywords: [l.code, ...l.group.split(/[: ]+/).filter(Boolean)] }));
}
