// LANG01 word fill (Adhil approved Oct 19, 7:06 AM). The saved cache holds these words in English (the AI once returned them unchanged),
// so the live translate API is asked once per language for the same word with one trailing space (a new cache key), within its daily cap.
// Every answer is checked (not English, no dashes, product names kept) before it goes into public/i18n/<lang>.json.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const want = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')); const MAX = Number(process.env.MAX_CALLS ?? 8); let calls = 0; const report = {};
const s = await sandbox('ravi');
for (const [lang, words] of Object.entries(want)) {
  if (calls >= MAX) { report[lang] = 'skipped: call cap'; continue; } calls++;
  const r = await s.api.post('/api/i18n/translate', { data: { lang, strings: words.map(w => w + ' ') }, timeout: 90000 }); const tr = r.ok() ? (await r.json()).translations ?? {} : {};
  const good = {}, refused = {};
  for (const w of words) { const t = String(tr[w + ' '] ?? '').trim();
    const why = !t ? 'none' : t.toLowerCase() === w.toLowerCase() ? 'still English' : /[-\u2010-\u2015]/.test(t) ? 'dash' : /\b(Agent|Groundwork|WhatsApp)\b/.test(w) !== /\b(Agent|Groundwork|WhatsApp)\b/.test(t) ? 'product name' : '';
    if (why) refused[w] = why + (t ? ': ' + t : ''); else good[w] = t; }
  const file = new URL(`../public/i18n/${lang}.json`, import.meta.url); const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, v] of Object.entries(good)) if (!Object.hasOwn(d, k)) d[k] = v;
  fs.writeFileSync(file, JSON.stringify(Object.fromEntries(Object.keys(d).sort().map(k => [k, d[k]])), null, 0).replace(/","/g, '",\n"') + '\n');
  report[lang] = { status: r.status(), added: good, refused }; console.log(lang, r.status(), Object.keys(good).length, 'added', Object.keys(refused).length, 'refused');
}
fs.writeFileSync('/workspace/qa/i18n/fill-oct19-report.json', JSON.stringify(report, null, 1)); console.log('calls', calls);
