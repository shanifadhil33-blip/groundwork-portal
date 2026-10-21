// Lesson 39: ad hoc live checks reuse the one fixed demo sandbox (same token file as the e2e suite). Never create new ones in a loop.
import { request } from '@playwright/test'; import fs from 'node:fs';
export const B = 'https://groundwork-portal.vercel.app';
const F = '/workspace/qa/e2e/sandbox-token';
export async function sandbox(persona = 'imran', { baseURL = B, tokenFile = F } = {}) {
  let token = ''; try { token = fs.readFileSync(tokenFile, 'utf8').trim(); } catch {}
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { origin: baseURL }, storageState: token ? { cookies: [{ name: 'groundwork-sandbox', value: token, domain: new URL(baseURL).hostname, path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' }], origins: [] } : undefined });
  const r = await api.post('/api/demo/start', { data: { persona } }); if (r.status() !== 201) throw new Error('demo start ' + r.status() + ' ' + await r.text());
  const ws = (await r.json()).workspace_id; const save = async () => { const c = (await api.storageState()).cookies.find(x => x.name === 'groundwork-sandbox'); if (c) fs.writeFileSync(tokenFile, c.value, { mode: 0o600 }); };
  await save();
  return { api, ws, as: p => api.post('/api/demo/switch', { data: { persona: p } }), reset: async () => { await api.post('/api/demo/reset', { data: { confirm: true } }); await save(); } };
}
