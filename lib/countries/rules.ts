// Rules that read the country data: names, menus, region fields, phone and tax ID checks, currency.
// Shared by the API validation, the forms and the assistant so all three agree exactly.
import { ALL_COUNTRY_CODES, COUNTRIES, type CountryData, GCC_FIRST } from './data';

const DEFAULT_COUNTRY = 'AE';
/** 'an emirate', 'a region', for messages built from a region label. */
export const an = (word: string) => /^[aeiou]/i.test(word) ? 'an' : 'a';
const names = typeof Intl !== 'undefined' && 'DisplayNames' in Intl ? new Intl.DisplayNames(['en'], { type: 'region' }) : null;

export function isCountry(code: unknown): code is string { return typeof code === 'string' && ALL_COUNTRY_CODES.includes(code); }
export function country(code?: string | null): CountryData & { code: string } {
  const c = code && isCountry(code) ? code : DEFAULT_COUNTRY;
  const data = COUNTRIES[c] as CountryData | undefined;
  return { ...data, name: data?.name ?? names?.of(c) ?? c, code: c };
}
export function countryName(code?: string | null) { return country(code).name; }

/** Menu options: the GCC first (in the order the product lists them), then every other country by name. */
export function countryOptions() {
  const rest = ALL_COUNTRY_CODES.filter(c => !(GCC_FIRST as readonly string[]).includes(c)).map(country).sort((a, b) => a.name.localeCompare(b.name));
  return [...GCC_FIRST.map(country), ...rest].map((c, index) => ({ value: c.code, label: c.name, keywords: [c.code, ...(c.aliases ?? [])], divider: index === GCC_FIRST.length }));
}

/** The region level a country uses for addresses: its label, its list when it has a fixed one. Always optional. */
export function regionField(code?: string | null) {
  const r = country(code).region;
  return { label: r?.label ?? 'Region', options: r?.options };
}
/** A region typed or picked for this country: the list's own spelling, or free text when there is no list. */
export function normalizeRegion(input: string, code?: string | null): string | null {
  const value = input.trim().replace(/\s+/g, ' ');
  if (!value || value.length > 120) return null;
  const options = regionField(code).options;
  if (!options) return value;
  return options.find(o => o.toLowerCase() === value.toLowerCase()) ?? null;
}

const dialOf = (code: string) => COUNTRIES[code]?.dial;
/** The country a full international number belongs to, by its calling code (calling codes never prefix each other). */
function byDial(digits: string) {
  return Object.keys(COUNTRIES).find(code => { const d = dialOf(code); return d && digits.startsWith(d); });
}

export function phoneHint(code?: string | null) {
  const c = country(code);
  return c.phone?.example ?? (c.dial ? `+${c.dial} and the number` : 'Include the country code, like +44 20 7946 0000');
}

/**
 * A phone number in any common form becomes E.164 (+966501234567). Without a + it is read in the given country:
 * its trunk 0 (or 1) and a missing + before the country code are both accepted. Numbers in a country we have rules
 * for are checked against that country's plan; any other number needs its + country code. Null when not valid.
 */
export function normalizePhone(input: string, code?: string | null): string | null {
  const raw = input.trim();
  if (!raw || !/^[+(\d][\d\s().-]*$/.test(raw)) return null;
  let digits = raw.replace(/[\s().-]/g, '');
  if (digits.startsWith('00')) digits = '+' + digits.slice(2);
  const home = country(code);
  if (!digits.startsWith('+')) {
    if (!home.dial) return null;
    if (digits.startsWith(home.dial) && digits.length > home.dial.length + 6) digits = digits.slice(home.dial.length);
    else if (home.phone?.trunk && digits.startsWith(home.phone.trunk)) digits = digits.slice(home.phone.trunk.length);
    else if (!home.phone?.trunk && digits.startsWith('0')) return null;
    digits = '+' + home.dial + digits;
  }
  const rest = digits.slice(1), owner = byDial(rest), plan = owner ? COUNTRIES[owner].phone : undefined;
  if (owner && plan) {
    const national = rest.slice(COUNTRIES[owner].dial!.length);
    return new RegExp(`^(?:${plan.national})$`).test(national) ? digits : null;
  }
  return /^\+[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

function group(value: string, sizes?: number[]) {
  if (!sizes || sizes.reduce((a, b) => a + b, 0) !== value.length) return value;
  let at = 0;
  return sizes.map(size => value.slice(at, at += size)).join(' ');
}
/** +966501234567 → +966 50 123 4567, by the owning country's digit groups. Unknown numbers stay as stored. */
export function formatPhone(value?: string | null) {
  if (!value) return '';
  if (!value.startsWith('+')) return value;
  const owner = byDial(value.slice(1));
  if (!owner) return value;
  const dial = COUNTRIES[owner].dial!, national = value.slice(1 + dial.length);
  return `+${dial} ${group(national, COUNTRIES[owner].phone?.groups?.[national.length])}`;
}

/** The tax ID a country uses on invoices, with its label and format. Other countries get an optional Tax number. */
export function taxField(code?: string | null) {
  const t = country(code).tax;
  return t ? { label: t.label, hint: t.hint, example: t.example, known: true } : { label: 'Tax number', hint: 'Optional. Letters and digits.', example: '', known: false };
}
export function normalizeTaxId(input: string, code?: string | null): string | null {
  const value = input.replace(/[\s.-]/g, '').toUpperCase();
  if (!value) return null;
  const t = country(code).tax;
  if (t) return new RegExp(`^(?:${t.pattern})$`).test(value) ? value : null;
  return /^[A-Z0-9/]{3,40}$/.test(value) ? value : null;
}
export function formatTaxId(value?: string | null, code?: string | null) { return value ? group(value, country(code).tax?.groups) : ''; }

export function currencyFor(code?: string | null) { return country(code).currency ?? 'USD'; }
/** Every currency the runtime knows, for the Settings menu. */
export function currencyOptions() {
  const codes = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.('currency') ?? [...new Set(Object.values(COUNTRIES).map(c => c.currency!).filter(Boolean))];
  return codes;
}
export function isCurrency(value: unknown): value is string { return typeof value === 'string' && /^[A-Z]{3}$/.test(value) && currencyOptions().includes(value); }
/** Money in the workspace currency, in the reader's own number format. */
export function formatMoney(amount: number, currency: string, locale?: string) {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(amount);
}

/** A first guess from the browser's timezone, so most people find their country already picked. */
const ZONES: Record<string, string> = { 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Muscat': 'OM', 'Asia/Qatar': 'QA', 'Asia/Bahrain': 'BH', 'Asia/Kuwait': 'KW', 'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Europe/London': 'GB', 'Africa/Cairo': 'EG', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Karachi': 'PK', 'Asia/Manila': 'PH' };
export function guessCountry(timezone?: string) {
  if (!timezone) return DEFAULT_COUNTRY;
  if (ZONES[timezone]) return ZONES[timezone];
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Indiana|Kentucky|Boise)/.test(timezone) || timezone === 'Pacific/Honolulu') return 'US';
  return DEFAULT_COUNTRY;
}
