import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { expect, it } from 'vitest';
import { LANGUAGES } from '../lib/languages';
import { TRADES, tradeLabels } from '../lib/trades';
import { TRADE_WORDS, tradeWordsPrompt, agentTradeWordsPrompt } from '../lib/trade-words';

it('tracks all trade values and screen labels plus common fixture terms', () => {
  for (const word of [...TRADES, ...Object.values(tradeLabels), 'Electrical', 'Carpentry', 'Painting', 'leak', 'tap', 'drain', 'valve', 'pipe', 'breaker', 'socket', 'switch', 'fan', 'filter', 'compressor', 'thermostat', 'door closer', 'lock', 'tile', 'ceiling', 'water heater', 'pump']) {
    expect(Object.hasOwn(TRADE_WORDS, word), word).toBe(true);
  }
  expect(Object.keys(TRADE_WORDS).length).toBeGreaterThan(40);
});

it('contains only exact translations from supported language files without English echoes or dashes', () => {
  const files = Object.fromEntries(LANGUAGES.filter(l => !/^en\b/i.test(l.code)).map(l => [l.code, JSON.parse(readFileSync(new URL(`../public/i18n/${l.code}.json`, import.meta.url), 'utf8'))]));
  for (const [word, translations] of Object.entries(TRADE_WORDS)) {
    expect(word).not.toMatch(/[\u002d\u2013\u2014]|Agent|Groundwork/i);
    for (const [code, value] of Object.entries(translations)) {
      expect(files[code]?.[word], `${code}: ${word}`).toBe(value);
      expect(value).not.toBe(word);
      expect(value).not.toMatch(/[\u002d\u2013\u2014]|Agent|Groundwork/i);
    }
    // Every eligible exact source entry must be included too.
    for (const [code, file] of Object.entries(files)) {
      const value = file[word];
      if (typeof value === 'string' && value.trim() && value !== word && !/[\u002d\u2013\u2014]|Agent|Groundwork/i.test(value)) expect(translations[code]).toBe(value);
    }
  }
});

it('rebuilds the checked in table deterministically', () => {
  const path = new URL('../lib/trade-words.json', import.meta.url);
  const before = readFileSync(path, 'utf8');
  execFileSync(process.execPath, ['scripts/build\u002dtrade-words.mjs']);
  expect(readFileSync(path, 'utf8')).toBe(before);
});

it('selects only whole words present in each source string ignoring case', () => {
  expect(tradeWordsPrompt('hi', ['Check plumbing and the LIGHT.'])).toBe(`Use these trade words exactly: Plumbing = ${TRADE_WORDS.Plumbing.hi}; Light = ${TRADE_WORDS.Light.hi}`);
  expect(tradeWordsPrompt('hi', ['Zach has a lightbulb and woodworking tools.'])).toBe('');
  expect(tradeWordsPrompt('hi', ['éAC', 'ACé', 'AC2', '_AC', 'plumb', 'ing'])).toBe('');
  expect(tradeWordsPrompt('hi', ['Check the leak.'])).toBe('');
  expect(tradeWordsPrompt('unknown', ['AC'])).toBe('');
  expect(tradeWordsPrompt('hi', ['Agent and Groundwork'])).toBe('');
});

it('omits the Agent list for every English variant and default preferences', () => {
  const messages = [{ content: 'AC Plumbing Light' }];
  for (const { code } of LANGUAGES.filter(l => /^en\b/i.test(l.code))) {
    expect(agentTradeWordsPrompt(code, messages)).toBe('');
  }
  expect(agentTradeWordsPrompt(null, messages)).toBe('');
  expect(agentTradeWordsPrompt(undefined, messages)).toBe('');
  expect(agentTradeWordsPrompt('hi', messages)).toContain('AC = ');
});

it('prints coverage for every supported language', () => {
  const output = execFileSync(process.execPath, ['scripts/trade-words\u002dcoverage.mjs'], { encoding: 'utf8' });
  for (const { code } of LANGUAGES) {
    const count = Object.values(TRADE_WORDS).filter(translations => translations[code]).length;
    expect(output).toContain(`${code}: ${count}/${Object.keys(TRADE_WORDS).length} (`);
  }
});
