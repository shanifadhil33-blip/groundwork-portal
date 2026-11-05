/**
 * One job on one short line (Nov 3: a late jobs reply repeated "Site: Marina Exchange", "Priority: Urgent" and blank
 * lines when jobs shared details). Every job line starts with its own WO number, so no two lines can be the same,
 * whatever the jobs have in common. Facts are joined with the comma of the reply language.
 */
const COMMAS: Record<string, string> = { 'ar-AE': '، ', ur: '، ', ps: '، ', 'fa-AF': '، ', 'fa-IR': '، ', 'zh-CN': '，', am: '፣ ', ti: '፣ ' };
export const listComma = (lang?: string | null) => COMMAS[lang ?? ''] ?? ', ';
/** Data from the database on one line: a stray line break or run of spaces in a title or site name becomes one space. */
export const oneLine = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
/** Plain job wording in the reply language: Job #31, مهمة #31 in Arabic, #31 in the other languages. */
export const jobRef = (number: number | string, lang?: string | null) => { const code = (lang ?? 'en').toLowerCase(); return code.startsWith('en') || !lang ? `Job #${number}` : code.startsWith('ar') ? `مهمة #${number}` : `#${number}`; };
/** "Job #31: Adjust meeting room cooling, Marina Exchange, Urgent, Due: 19 Oct 2026". Empty facts are left out. */
export function jobLine(number: number | string, title: string, facts: unknown[], lang?: string | null, bullet = '') {
  const rest = facts.map(oneLine).filter(Boolean);
  return `${bullet}${jobRef(number, lang)}: ${[oneLine(title), ...rest].join(listComma(lang))}`;
}
/** The same text once only, first place kept, for lists of free text such as notification messages. */
export const distinct = (lines: string[]) => [...new Set(lines.map(oneLine).filter(Boolean))];
