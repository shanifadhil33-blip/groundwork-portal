import table from './trade-words.json';
import { DEFAULT_LANGUAGE } from './languages';
import { isEnglish } from './i18n';

/** Generated only from exact source keys in the language files. Empty entries await review. */
export const TRADE_WORDS: Readonly<Record<string, Readonly<Partial<Record<string, string>>>>> = table;

/** Whole words, ignoring case. Do not match AC inside a name or join separate strings. */
export function tradeWordsPrompt(language: string, strings: readonly string[], limit = Infinity): string {
  if (isEnglish(language)) return '';
  const entries = Object.entries(TRADE_WORDS).filter(([word, translations]) => {
    if (!translations[language]) return false;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'iu');
    return strings.some(source => pattern.test(source));
  }).slice(0, limit);
  return entries.length ? `Use these trade words exactly: ${entries.map(([word, translations]) => `${word} = ${translations[language]}`).join('; ')}` : '';
}

export function agentTradeWordsPrompt(language: string | null | undefined, messages: readonly { content: string }[]): string {
  return tradeWordsPrompt(language ?? DEFAULT_LANGUAGE, messages.map(message => message.content), 20);
}
