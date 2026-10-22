import { readFileSync, writeFileSync } from 'node:fs';
// These scripts also run directly on Node 20, which needs a TypeScript loader.
import { register } from 'tsx/esm/api';
register();
const { LANGUAGES } = await import('../lib/languages.ts');
const { TRADES, tradeLabels } = await import('../lib/trades.ts');

// Exact source keys only. Keep missing words so LANG08 reviewers can fill the gaps.
// Job terms come from the demo fixtures and the parts used in their reports and quotes.
export const tradeWordSources = [...new Set([
  ...TRADES, ...Object.values(tradeLabels), 'Electrical', 'Carpentry', 'Painting',
  'leak', 'tap', 'drain', 'valve', 'pipe', 'breaker', 'socket', 'switch',
  'light', 'fan', 'filter', 'compressor', 'thermostat', 'door closer', 'lock',
  'tile', 'ceiling', 'water heater', 'pump', 'sink', 'toilet', 'fan motor',
  'bearing', 'wiring', 'cable', 'drain tray', 'joint', 'grease trap',
  'Capacitor', 'Washer', 'Cable clip', 'tap cartridge', 'washer', 'ventilation', 'handrail', 'Light', 'Filters',
])];

export function buildTradeWords() {
  const table = Object.fromEntries(tradeWordSources.map(word => [word, {}]));
  for (const { code } of LANGUAGES) {
    if (/^en\b/i.test(code)) continue;
    const file = JSON.parse(readFileSync(new URL(`../public/i18n/${code}.json`, import.meta.url), 'utf8'));
    for (const word of tradeWordSources) {
      const value = file[word];
      if (typeof value === 'string' && value.trim() && value !== word && !/[\u002d\u2013\u2014]/u.test(value) && !/Agent|Groundwork/i.test(value)) {
        table[word][code] = value;
      }
    }
  }
  return table;
}

writeFileSync(new URL('../lib/trade-words.json', import.meta.url), `${JSON.stringify(buildTradeWords(), null, 2)}\n`);
