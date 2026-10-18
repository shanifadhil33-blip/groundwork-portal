// Refills language file words removed for being in the wrong script (Hindi in Urdu letters, Malayalam with Tamil letters).
// Runs after the script check is live, so the server refuses wrong script answers. Saved words first, then the free AI chain.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const removed = JSON.parse(fs.readFileSync('/workspace/qa/i18n/wrong-script-removed.json', 'utf8'));
const s = await sandbox('ravi'); const got = {};
for (const [lang, strings] of Object.entries(removed)) {
  got[lang] = {};
  for (let i = 0; i < strings.length; i += 40) {
    const batch = strings.slice(i, i + 40);
    const r = await s.api.post('/api/i18n/translate', { data: { lang, strings: batch }, timeout: 120000 });
    if (!r.ok()) { console.log(lang, 'status', r.status()); continue; }
    const tr = (await r.json()).translations ?? {};
    for (const k of batch) if (typeof tr[k] === 'string' && tr[k] !== k) got[lang][k] = tr[k];
  }
  console.log(lang, Object.keys(got[lang]).length, 'of', strings.length);
}
fs.writeFileSync('/workspace/qa/i18n/wrong-script-refill.json', JSON.stringify(got, null, 1));
