import { readFileSync } from 'node:fs';
// These scripts also run directly on Node 20, which needs a TypeScript loader.
import { register } from 'tsx/esm/api';
register();
const { LANGUAGES } = await import('../lib/languages.ts');

const table = JSON.parse(readFileSync(new URL('../lib/trade-words.json', import.meta.url), 'utf8'));
const words = Object.values(table);
for (const { code, name } of LANGUAGES) {
  const count = words.filter(translations => translations[code]).length;
  console.log(`${code}: ${count}/${words.length} (${name})${/^en\b/i.test(code) ? ' English source' : ''}`);
}
