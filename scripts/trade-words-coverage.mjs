import { readFileSync } from 'node:fs';
import { LANGUAGES } from '../lib/languages.ts';

const table = JSON.parse(readFileSync(new URL('../lib/trade-words.json', import.meta.url), 'utf8'));
const words = Object.values(table);
for (const { code, name } of LANGUAGES) {
  const count = words.filter(translations => translations[code]).length;
  console.log(`${code}: ${count}/${words.length} (${name})${/^en\b/i.test(code) ? ' English source' : ''}`);
}
