/**
 * LANG01 slice 2: dates and times written in the person's language by the app itself, so today's date never waits
 * for the AI translator. The browser's own calendar data (Intl) is used except for languages a
 * browser may lack (Nepali, Pashto, Tigrinya, Somali, Yoruba, Hausa, Igbo, Luganda, Twi in Chrome today) the weekday
 * and month names below are always used on both server and browser, copied from Unicode CLDR. Never a mix: either the whole date is
 * in the person's language, or (unknown language) the whole date stays in English.
 * Numbers stay 0 to 9 and the calendar stays Gregorian (Farsi and Dari would otherwise switch to the Persian
 * calendar and show a different day number from the job data). Times are 24 hour outside English, so no AM or PM
 * word from another language can slip in.
 */
import { isEnglish } from './i18n';

type Words = { dl: string[]; ds: string[]; ml: string[]; ms: string[] };
// weekday long and short (Sunday first), month long and short (January first). Generated from CLDR (Node full ICU).
export const DATE_WORDS: Record<string, Words> = {"ne":{"dl":["आइतबार","सोमबार","मङ्गलबार","बुधबार","बिहिबार","शुक्रबार","शनिबार"],"ds":["आइत","सोम","मङ्गल","बुध","बिहि","शुक्र","शनि"],"ml":["जनवरी","फेब्रुअरी","मार्च","अप्रिल","मे","जुन","जुलाई","अगस्ट","सेप्टेम्बर","अक्टोबर","नोभेम्बर","डिसेम्बर"],"ms":["जनवरी","फेब्रुअरी","मार्च","अप्रिल","मे","जुन","जुलाई","अगस्ट","सेप्टेम्बर","अक्टोबर","नोभेम्बर","डिसेम्बर"]},"ps":{"dl":["يونۍ","دونۍ","درېنۍ","څلرنۍ","پينځنۍ","جمعه","اونۍ"],"ds":["يونۍ","دونۍ","درېنۍ","څلرنۍ","پينځنۍ","جمعه","اونۍ"],"ml":["جنوري","فبروري","مارچ","اپریل","مۍ","جون","جولای","اګست","سېپتمبر","اکتوبر","نومبر","دسمبر"],"ms":["جنوري","فبروري","مارچ","اپریل","مۍ","جون","جولای","اګست","سېپتمبر","اکتوبر","نومبر","دسمبر"]},"ti":{"dl":["ሰንበት","ሰኑይ","ሰሉስ","ረቡዕ","ሓሙስ","ዓርቢ","ቀዳም"],"ds":["ሰን","ሰኑ","ሰሉ","ረቡ","ሓሙ","ዓር","ቀዳ"],"ml":["ጥሪ","ለካቲት","መጋቢት","ሚያዝያ","ጉንበት","ሰነ","ሓምለ","ነሓሰ","መስከረም","ጥቅምቲ","ሕዳር","ታሕሳስ"],"ms":["ጥሪ","ለካ","መጋ","ሚያ","ግን","ሰነ","ሓም","ነሓ","መስ","ጥቅ","ሕዳ","ታሕ"]},"so":{"dl":["Axad","Isniin","Talaado","Arbaco","Khamiis","Jimco","Sabti"],"ds":["Axd","Isn","Tldo","Arbc","Khms","Jmc","Sbti"],"ml":["Janaayo","Febraayo","Maarso","Abriil","Maayo","Juun","Luulyo","Agosto","Sebtembar","Oktoobar","Noofeembar","Diseembar"],"ms":["Jan","Feb","Mar","Abr","May","Jun","Lul","Ogs","Seb","Okt","Nof","Dis"]},"yo":{"dl":["Àìkú","Ajé","Ìsẹ́gun","Ọjọ́rú","Ọjọ́bọ","Ẹtì","Àbámẹ́ta"],"ds":["Àìkú","Ajé","Ìsẹ́gun","Ọjọ́rú","Ọjọ́bọ","Ẹtì","Àbámẹ́ta"],"ml":["Oṣù Ṣẹ́rẹ́","Oṣù Èrèlè","Oṣù Ẹrẹ̀nà","Oṣù Ìgbé","Oṣù Ẹ̀bibi","Oṣù Òkúdu","Oṣù Agẹmọ","Oṣù Ògún","Oṣù Owewe","Oṣù Ọ̀wàrà","Oṣù Bélú","Oṣù Ọ̀pẹ̀"],"ms":["Oṣù Ṣẹ́rẹ́","Oṣù Èrèlè","Oṣù Ẹrẹ̀nà","Oṣù Ìgbé","Oṣù Ẹ̀bibi","Oṣù Òkúdu","Oṣù Agẹmọ","Oṣù Ògún","Oṣù Owewe","Oṣù Ọ̀wàrà","Oṣù Bélú","Oṣù Ọ̀pẹ̀"]},"ha":{"dl":["Lahadi","Litinin","Talata","Laraba","Alhamis","Jummaʼa","Asabar"],"ds":["Lah","Lit","Tal","Lar","Alh","Jum","Asa"],"ml":["Janairu","Faburairu","Maris","Afirilu","Mayu","Yuni","Yuli","Agusta","Satumba","Oktoba","Nuwamba","Disamba"],"ms":["Jan","Fab","Mar","Afi","May","Yun","Yul","Agu","Sat","Okt","Nuw","Dis"]},"ig":{"dl":["Sọndee","Mọnde","Tiuzdee","Wenezdee","Tọọzdee","Fraịdee","Satọdee"],"ds":["Sọn","Mọn","Tiu","Wen","Tọọ","Fraị","Sat"],"ml":["Jenụwarị","Febrụwarị","Maachị","Epreel","Mee","Jun","Julaị","Ọgọọst","Septemba","Ọktoba","Novemba","Disemba"],"ms":["Jen","Feb","Maa","Epr","Mee","Juu","Jul","Ọgọ","Sep","Ọkt","Nov","Dis"]},"lg":{"dl":["Sabbiiti","Balaza","Lwakubiri","Lwakusatu","Lwakuna","Lwakutaano","Lwamukaaga"],"ds":["Sab","Bal","Lw2","Lw3","Lw4","Lw5","Lw6"],"ml":["Janwaliyo","Febwaliyo","Marisi","Apuli","Maayi","Juuni","Julaayi","Agusito","Sebuttemba","Okitobba","Novemba","Desemba"],"ms":["Jan","Feb","Mar","Apu","Maa","Juu","Jul","Agu","Seb","Oki","Nov","Des"]},"tw":{"dl":["Kwasiada","Dwoada","Benada","Wukuada","Yawoada","Fiada","Memeneda"],"ds":["Kwe","Dwo","Ben","Wuk","Yaw","Fia","Mem"],"ml":["Ɔpɛpɔn","Ɔgyefoɔ","Ɔbɛnem","Oforisuo","Kɔtɔnimma","Ayɛwohomumu","Kutawonsa","Ɔsanaa","Ɛbɔ","Ahinime","Obubuo","Ɔpɛnimma"],"ms":["Ɔpɛpɔn","Ɔgyefoɔ","Ɔbɛnem","Oforisuo","Kɔtɔnimma","Ayɛwohomumu","Kutawonsa","Ɔsanaa","Ɛbɔ","Ahinime","Obubuo","Ɔpɛnimma"]}};

const ENGLISH = 'en-GB';
/** The app language codes Intl knows under another name. */
const INTL_NAME: Record<string, string> = { tw: 'ak' };
export const intlLocale = (lang: string) => INTL_NAME[lang] ?? lang;

/** The language the screen is shown in: set on <html lang> by the pre paint hint and the Translator. Server: English. */
export function uiLang(): string {
  if (typeof document === 'undefined') return 'en-IN';
  return document.documentElement.lang || 'en-IN';
}

const sample = new Date(Date.UTC(2026, 9, 18, 12));
const nativeCache = new Map<string, boolean>();
/** Tests only: forget what the runtime was found to support. */
export function resetDateSupport() { nativeCache.clear(); }
/** True when this runtime really has calendar words for the language (not a silent fall back to English). */
export function hasNativeDates(lang: string): boolean {
  const known = nativeCache.get(lang);
  if (known !== undefined) return known;
  let ok = false;
  try {
    const loc = intlLocale(lang);
    if (Intl.DateTimeFormat.supportedLocalesOf([loc]).length) {
      const o: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', timeZone: 'UTC' };
      const mine = new Intl.DateTimeFormat(loc, o).format(sample), en = new Intl.DateTimeFormat('en', o).format(sample);
      ok = mine !== en && !/Sunday|October/.test(mine);
    }
  } catch { ok = false; }
  nativeCache.set(lang, ok);
  return ok;
}

/** First letter as the reader sees it (keeps accents and vowel signs with their letter). */
function firstLetter(word: string): string {
  try { const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' }); for (const g of seg.segment(word)) return g.segment; } catch { /* old runtime */ }
  return Array.from(word)[0] ?? word;
}

function withClock(o: Intl.DateTimeFormatOptions): Intl.DateTimeFormatOptions {
  return o.hour !== undefined || o.timeStyle ? { ...o, hour12: false, hourCycle: 'h23' } : o;
}

/**
 * Format a date for the person's language. english is the locale used for English readers (kept as each screen had it).
 * Returns text that must not be sent to the translator: render it inside an element with data-no-translate.
 */
export function formatInLang(value: Date | number | string, options: Intl.DateTimeFormatOptions, lang = uiLang(), english = 'en'): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  if (isEnglish(lang)) return new Intl.DateTimeFormat(english, options).format(date);
  // The saved words must be identical during server render and browser hydration, regardless of ICU support.
  if (!DATE_WORDS[lang] && hasNativeDates(lang)) {
    try { return new Intl.DateTimeFormat(`${intlLocale(lang)}-u-nu-latn-ca-gregory`, withClock(options)).format(date); } catch { /* fall through */ }
  }
  const words = DATE_WORDS[lang];
  if (!words) return new Intl.DateTimeFormat(english, options).format(date);
  // Saved words: the day, month and year order of UK English, with every word swapped for the person's own.
  let opts = withClock(options);
  if (opts.dateStyle || opts.timeStyle) {
    const { dateStyle, timeStyle, ...rest } = opts;
    opts = { ...rest, ...(dateStyle ? { day: 'numeric', month: dateStyle === 'full' || dateStyle === 'long' ? 'long' : 'short', year: 'numeric', ...(dateStyle === 'full' ? { weekday: 'long' } : {}) } : {}), ...(timeStyle ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } : {}) } as Intl.DateTimeFormatOptions;
  }
  const parts = new Intl.DateTimeFormat(ENGLISH, opts).formatToParts(date);
  const tz = opts.timeZone;
  const pick = (o: Intl.DateTimeFormatOptions) => Number(new Intl.DateTimeFormat('en-US', { ...o, timeZone: tz }).format(date)) - 1;
  const weekday = (() => { const d = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: tz }).format(date); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(d); })();
  return parts.map(p => {
    if (p.type === 'weekday') { const w = (opts.weekday === 'long' ? words.dl : words.ds)[weekday] ?? p.value; return opts.weekday === 'narrow' ? firstLetter(w) : w; }
    if (p.type === 'month' && opts.month !== 'numeric' && opts.month !== '2-digit') return (opts.month === 'long' ? words.ml : words.ms)[pick({ month: 'numeric' })] ?? p.value;
    if (p.type === 'dayPeriod') return '';
    if (p.type === 'literal' && /[A-Za-z]/.test(p.value)) return ' ';
    return p.value;
  }).join('').replace(/\s+/g, ' ').trim();
}

/** Calendar column letters, Sunday first: Su Mo in English, the first letter of each day in the person's language. */
export function weekLetters(lang = uiLang()): string[] {
  if (isEnglish(lang)) return ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return Array.from({ length: 7 }, (_, i) => formatInLang(new Date(Date.UTC(2026, 0, 4 + i, 12)), { weekday: 'narrow', timeZone: 'UTC' }, lang));
}
