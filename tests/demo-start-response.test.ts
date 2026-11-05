import { afterEach, expect, it, vi } from 'vitest';
import { post, postDemoStart } from '../lib/ui/api';
import { ApiError } from '../lib/http';
import { POST } from '../app/api/demo/start/route';

const service = vi.hoisted(() => ({ startDemo: vi.fn() }));
vi.mock('../lib/services/demo', () => ({ startDemo: service.startDemo, sandboxCookie: () => 'groundwork-sandbox=signed; Path=/api/demo; HttpOnly; SameSite=Lax' }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.clearAllMocks(); });

it('returns a complete byte counted JSON body with every demo cookie', async () => {
 const body = { workspace_id: 'sandbox', persona: 'ravi', expires_at: '2026-11-06T12:00:00Z' };
 service.startDemo.mockResolvedValue({ body, cookie: 'session=token; Path=/; HttpOnly; SameSite=Lax' });
 const response = await POST(new Request('http://localhost/api/demo/start', { method: 'POST', body: JSON.stringify({ persona: 'ravi', language: 'ar-AE' }) }));
 expect(response.status).toBe(201);
 expect(response.headers.get('cache-control')).toBe('no-store');
 const bytes = await response.arrayBuffer();
 expect(Number(response.headers.get('content-length'))).toBe(bytes.byteLength);
 expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(body);
 const cookies = response.headers.get('set-cookie');
 for (const cookie of ['session=token', 'groundwork-demo=1', 'groundwork-sandbox=signed', 'gw-lang=ar-AE']) expect(cookies).toContain(cookie);
});

it('preserves rate limit failures on the route', async () => {
 service.startDemo.mockRejectedValue(new ApiError(429, 'rate_limited', 'Please wait.'));
 const response = await POST(new Request('http://localhost/api/demo/start', { method: 'POST', body: '{"persona":"ravi"}' }));
 expect(response.status).toBe(429);
 expect(response.headers.has('set-cookie')).toBe(false);
});

it('finishes demo start on success headers even when the response body never closes', async () => {
 let signal: AbortSignal;
 const json = vi.fn(() => new Promise(() => {}));
 vi.stubGlobal('fetch', vi.fn(async (_url, init) => { signal = init.signal; return { ok: true, status: 201, json }; }));
 await expect(postDemoStart({ persona: 'ravi', language: 'ar-AE' })).resolves.toBeUndefined();
 expect(json).not.toHaveBeenCalled();
 expect(signal!.aborted).toBe(true);
});

it.each([429, 503])('keeps demo start HTTP %s errors', async status => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ error: { code: 'demo_retry', message: 'Please wait.' } }, { status })));
 await expect(postDemoStart({ persona: 'ravi', language: 'ar-AE' })).rejects.toMatchObject({ status, code: 'demo_retry' });
});

it('bounds demo start when no headers arrive without retrying the creation', async () => {
 vi.useFakeTimers();
 const fetch = vi.fn((_url, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
 vi.stubGlobal('fetch', fetch);
 const result = expect(postDemoStart({ persona: 'ravi', language: 'ar-AE' })).rejects.toMatchObject({ status: 0, code: 'network' });
 await vi.advanceTimersByTimeAsync(60_000);
 await result;
 expect(fetch).toHaveBeenCalledTimes(1);
});

it('bounds an error body that stalls while retaining its HTTP status', async () => {
 vi.useFakeTimers();
 vi.stubGlobal('fetch', vi.fn(async (_url, init) => new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError'))); } }), { status: 429 })));
 const result = expect(postDemoStart({ persona: 'ravi', language: 'ar-AE' })).rejects.toMatchObject({ status: 429 });
 await vi.advanceTimersByTimeAsync(60_000);
 await result;
});

it('still reads JSON for ordinary posts', async () => {
 vi.stubGlobal('fetch', vi.fn(async () => Response.json({ saved: true })));
 await expect(post('/api/other', {})).resolves.toEqual({ saved: true });
});
