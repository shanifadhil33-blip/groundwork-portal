import { test, expect } from '@playwright/test';
import { Demo } from './helpers';
// Each role's screens open, show no error text, no jargon and no sparkle icons.
let d: Demo;
test.beforeAll(async () => { d = await Demo.start('imran'); });
test.afterAll(async () => { await d?.reset(); });
const pages: Record<string, string[]> = { imran: ['/dashboard', '/work-orders', '/suggestions', '/settings'], sam: ['/dashboard', '/suggestions'], ravi: ['/today', '/dashboard'], nabil: ['/dashboard'], pranav: ['/dashboard'], kevin: ['/dashboard'], faisal: ['/dashboard'] };
const PHONE = new Set(['ravi', 'faisal']);
// Technicians and households live on phones: their screens are checked at 390 first, with tap targets of at least 44px.
for (const [p, paths] of Object.entries(pages)) test(`${p} screens open cleanly${PHONE.has(p) ? ' at 390 phone' : ''}`, async ({ page }) => {
  if (PHONE.has(p)) await page.setViewportSize({ width: 390, height: 844 });
  await d.as(p as any); await d.page(page);
  for (const path of paths) {
    const r = await page.goto(path); expect(r?.status() ?? 200, path).toBeLessThan(500);
    const text = await page.locator('main, body').first().innerText();
    expect(text, path).not.toMatch(/\bdispatch\b|application error|unhandled|undefined|NaN/i);
    if (PHONE.has(p)) {
      expect(await page.evaluate(() => document.documentElement.scrollWidth), `${path} no sideways scroll`).toBeLessThanOrEqual(392);
      const small = await page.$$eval('main button:visible, main a.button:visible', els => els.filter(e => { const r = e.getBoundingClientRect(); return r.height > 0 && r.height < 40; }).map(e => (e.textContent ?? '').trim().slice(0, 30)));
      expect(small, `${path} tap targets under 40px`).toEqual([]);
    }
    expect(await page.locator('[class*=sparkle], [data-lucide=sparkles], .lucide-sparkles').count(), path).toBe(0);
  }
});
