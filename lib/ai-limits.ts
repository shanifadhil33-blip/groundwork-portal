import { AsyncLocalStorage } from 'node:async_hooks';
import { ApiError } from './http';
import { failureWords } from './agent/failure-words';

export const ASSISTANT_TIMEOUT = 'The assistant is taking too long right now. Please try again in a minute.';
export const TRANSCRIBE_TIMEOUT = 'We could not hear your message in time. Please try again or type it.';
export const AI_RATE_LIMIT = 'You have sent a lot of requests. Please wait a minute and try again.';
export const aiTimeout = (kind: 'assistant' | 'transcribe', language?: string | null) =>
 new ApiError(503, 'ai_timeout', failureWords(language, kind === 'assistant' ? ASSISTANT_TIMEOUT : TRANSCRIBE_TIMEOUT));

/** Fixed windows per warm serverless instance. Existing tables store daily provider
 * usage or idempotent responses, not request counters. No migration or paid service.
 * Separate instances have independent allowances. Expired entries are pruned.
 */
export function createAiRateLimiter(now: () => number = Date.now) {
 const windows = new Map<string, { start: number; count: number }>();
 const check = (user: string, kind: 'assistant' | 'transcribe', language?: string | null) => {
  const time = now();
  for (const [key, window] of windows) if (time >= window.start + 60000) windows.delete(key);
  const key = `${kind}:${user}`;
  const window = windows.get(key) ?? { start: time, count: 0 };
  windows.set(key, window);
  if (window.count >= 10) throw new ApiError(429, 'ai_rate_limit', failureWords(language, AI_RATE_LIMIT));
  window.count++;
 };
 return Object.assign(check, { reset: () => windows.clear() });
}
export const limitAiRequest = createAiRateLimiter();

/** Bounds fetch and response consumption, even if a transport ignores abort. */
export async function providerAttempt<T>(until: number, cap: number, kind: 'assistant' | 'transcribe', language: string | null | undefined, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
 const remaining = until - Date.now();
 if (remaining <= 0) throw aiTimeout(kind, language);
 const controller = new AbortController();
 let timer: ReturnType<typeof setTimeout> | undefined;
 try {
  return await Promise.race([
   run(controller.signal),
   new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(aiTimeout(kind, language)); }, Math.min(cap, remaining)); }),
  ]);
 } finally { if (timer) clearTimeout(timer); controller.abort(); }
}

// Nested assistant tools share one budget instead of starting a new provider chain clock.
const assistantDeadline = new AsyncLocalStorage<number>();
export const getAssistantDeadline = () => assistantDeadline.getStore();
export const withAssistantDeadline = <T>(run: () => Promise<T>) => {
 const until = Date.now() + 50_000;
 // Completed work may already have committed changes; enforce deadlines before new work.
 return assistantDeadline.run(until, run);
};
