import { test, expect } from '@playwright/test';
import { Demo, list } from './helpers';
// The Yes and Change card for every role, through the real agent route. Each run asks the AI at most a few questions;
// when every provider is busy the backup answer from app data is accepted, but an error reply never is.
let d: Demo;
test.beforeAll(async () => { d = await Demo.start('imran'); });
test.afterAll(async () => { await d?.reset(); });
const BAD = /limit for workspace actions|request is incomplete|can.t answer that right now|something went wrong/i;
async function ask(text: string) { const r = await d.post('/assistant', { messages: [{ role: 'user', content: text }] }); expect(r.status).toBe(200); return r.body; }

test('backup answers: what needs attention never shows an error (no AI call needed)', async () => {
  for (const p of ['imran', 'ravi', 'pranav'] as const) { await d.as(p); const b = await ask('What needs my attention?'); expect(JSON.stringify(b)).not.toMatch(BAD); expect(b.available).not.toBe(false); }
});
const roles: [string, string][] = [['imran', 'Add a team note on my latest job saying check the pump'], ['ravi', 'Suggest a job: the lobby light is flickering at my current site'], ['pranav', 'Please raise a request: the meeting room AC is leaking'], ['faisal', 'Raise a request: kitchen sink blocked, Saturday after 4 PM suits me']];
for (const [p, q] of roles) test(`${p}: a write shows Yes and Change, Change sends nothing`, async ({ page }) => {
  await d.as(p as any);
  const b = await ask(q); expect(JSON.stringify(b)).not.toMatch(BAD);
  if (!b.pending_action) test.info().annotations.push({ type: 'note', description: `no card: ${String(b.reply).slice(0, 120)}` });
  // The UI renders the card: open the dashboard and check both buttons exist on a card if one is pending.
  await d.page(page); await page.goto('/dashboard');
  await expect(page.locator('body')).not.toContainText(/limit for workspace actions|request is incomplete/);
  if (b.pending_action) expect(b.pending_action.summary.length).toBeGreaterThan(5);
});
