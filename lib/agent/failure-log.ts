/** Only fixed categories and numeric status codes: never error messages, prompts, headers or response bodies. */
export function logAssistantFailure(stage: 'request' | 'planned' | 'turn' | 'deadline' | 'action_limit' | 'demo_limit', error?: unknown) {
 const value = error as { name?: unknown; status?: unknown } | null;
 const reason = value?.name === 'TimeoutError' || value?.name === 'AbortError' ? 'timeout'
  : value?.status === 429 || value?.status === 402 ? 'quota'
  : error ? 'error' : 'unavailable';
 const status = typeof value?.status === 'number' && Number.isInteger(value.status) && value.status >= 100 && value.status <= 599 ? value.status : undefined;
 console.warn('[assistant] fallback', { stage, reason, ...(status ? { status } : {}) });
}
