import { afterEach, expect, it, vi } from 'vitest';
import { AI_RATE_LIMIT, TRANSCRIBE_TIMEOUT, createAiRateLimiter, withAssistantDeadline } from '../lib/ai-limits';
import { transcribeAudio } from '../lib/ai-transcribe';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('allows ten requests and rejects the eleventh with the friendly 429', () => {
 const limit = createAiRateLimiter(() => 0);
 for (let i = 0; i < 10; i++) limit('user', 'assistant');
 expect(() => limit('user', 'assistant')).toThrow(expect.objectContaining({ status: 429, message: AI_RATE_LIMIT }));
});
it('keeps separate users and route buckets independent and resets after a minute', () => {
 let time = 0; const limit = createAiRateLimiter(() => time);
 for (let i = 0; i < 10; i++) limit('one', 'assistant');
 expect(() => limit('two', 'assistant')).not.toThrow(); expect(() => limit('one', 'transcribe')).not.toThrow();
 time = 59999; expect(() => limit('one', 'assistant')).toThrow();
 time = 60000; expect(() => limit('one', 'assistant')).not.toThrow();
});
it('bounds a hung provider by the shared deadline and returns the friendly error without starting fallback', async () => {
 vi.useFakeTimers(); vi.stubEnv('GEMINI_API_KEY', 'test'); vi.stubEnv('CLOUDFLARE_AI_TOKEN', 'test'); vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test');
 const fetch = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', fetch);
 const result = transcribeAudio(new Uint8Array([1]), 'audio/webm', 'en-IN', 50);
 const check = expect(result).rejects.toMatchObject({ status: 503, message: TRANSCRIBE_TIMEOUT });
 await vi.advanceTimersByTimeAsync(50); await check;
 expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0]).toBeDefined();
});
it('continues to the next transcription provider within the remaining budget', async () => {
 vi.stubEnv('GEMINI_API_KEY', 'test'); vi.stubEnv('AI_GEMINI_MODELS', 'first,second');
 const fetch = vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(Response.json({ candidates: [{ content: { parts: [{ text: 'Hello' }] } }] }));
 vi.stubGlobal('fetch', fetch);
 await expect(transcribeAudio(new Uint8Array([1]), 'audio/webm', 'en-IN')).resolves.toBe('Hello');
 expect(fetch).toHaveBeenCalledTimes(2);
 for (const [, init] of fetch.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
});
it('bounds the final Cloudflare transcription fallback as well as Gemini', async () => {
 vi.useFakeTimers(); vi.stubEnv('GEMINI_API_KEY', ''); vi.stubEnv('CLOUDFLARE_AI_TOKEN', 'test'); vi.stubEnv('CLOUDFLARE_ACCOUNT_ID', 'test');
 const fetch = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', fetch);
 const result = transcribeAudio(new Uint8Array([1]), 'audio/webm', 'en-IN', 50);
 const check = expect(result).rejects.toMatchObject({ status: 503, message: TRANSCRIBE_TIMEOUT });
 await vi.advanceTimersByTimeAsync(50); await check; expect(fetch).toHaveBeenCalledTimes(1);
});
it('nested assistant provider attempts share the overall deadline and return the completed fallback result', async () => {
 const { withFallback, resetCooldowns } = await import('../lib/ai');
 vi.useFakeTimers(); resetCooldowns();
 const fetch = vi.fn(() => new Promise<Response>(() => {})); vi.stubGlobal('fetch', fetch);
 const providers = [{ name: 'gemini/test', kind: 'gemini' as const, url: 'https://example.invalid', headers: {}, model: 'test' }];
 const result = withAssistantDeadline(async () => {
  // Earlier tools have already spent most of the request budget.
  await new Promise(resolve => setTimeout(resolve, 49500));
  return withFallback('assistant', () => ({}), () => null, {}, providers);
 });
 await Promise.all([expect(result).resolves.toBeNull(), vi.advanceTimersByTimeAsync(50000)]);
 expect(fetch).toHaveBeenCalledTimes(1);
});

it('returns a completed assistant result even when run finishes after the deadline', async () => {
 vi.useFakeTimers();
 const reply = { available: true, reply: 'Request created.', logged: true };
 const result = withAssistantDeadline(async () => {
  await new Promise(resolve => setTimeout(resolve, 50001));
  return reply;
 });
 await Promise.all([expect(result).resolves.toBe(reply), vi.advanceTimersByTimeAsync(50001)]);
});
