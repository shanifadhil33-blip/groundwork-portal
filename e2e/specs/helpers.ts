import { expect, type APIRequestContext, type Page, request as pwRequest } from '@playwright/test';
export const BASE = process.env.E2E_BASE_URL ?? 'https://groundwork-portal.vercel.app';
export type Persona = 'imran' | 'sam' | 'ravi' | 'nabil' | 'pranav' | 'omar' | 'kevin' | 'faisal';
/** One private demo sandbox for the whole run. Switching persona keeps the same company data. */
export class Demo {
  api!: APIRequestContext; ws = ''; who: Persona | '' = '';
  static async start(first: Persona = 'imran') {
    const d = new Demo(); d.api = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
    const r = await d.api.post('/api/demo/start', { data: { persona: first } });
    expect(r.status(), await r.text()).toBe(201); d.ws = (await r.json()).workspace_id; d.who = first; return d;
  }
  async as(p: Persona) { if (this.who === p) return this; const r = await this.api.post('/api/demo/switch', { data: { persona: p } }); expect(r.status(), await r.text()).toBe(200); this.who = p; return this; }
  url(path: string) { return `/api/workspaces/${this.ws}${path}`; }
  async get(path: string) { const r = await this.api.get(this.url(path)); return { status: r.status(), body: await r.json().catch(() => null) }; }
  async post(path: string, data: unknown = {}) { const r = await this.api.post(this.url(path), { data }); return { status: r.status(), body: await r.json().catch(() => null) }; }
  async patch(path: string, data: unknown) { const r = await this.api.patch(this.url(path), { data }); return { status: r.status(), body: await r.json().catch(() => null) }; }
  /** A route that is not live yet returns 404/405 from Next; the check is then skipped as "not built". */
  async exists(path: string) { const r = await this.api.get(this.url(path)); return r.status() !== 404 && r.status() !== 405; }
  async notifications() { return (await this.get('/notifications?pageSize=50')).body?.data ?? []; }
  async page(browserPage: Page) { const st = await this.api.storageState(); await browserPage.context().addCookies(st.cookies); return browserPage; }
  async reset() { await this.api.post('/api/demo/reset', { data: { confirm: true } }).catch(() => null); await this.api.dispose(); }
}
export const stamp = () => `E2E ${Date.now().toString(36)}`;
export const list = (b: any): any[] => Array.isArray(b) ? b : b?.data ?? b?.rows ?? b?.items ?? [];
