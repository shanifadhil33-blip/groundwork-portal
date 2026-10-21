// Local layout regression: node e2e/bell-phone-local.mjs [http://127.0.0.1:3000]
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { sandbox } from './sandbox.mjs';

const baseURL = process.argv[2] || 'http://127.0.0.1:3000';
const origin = new URL(baseURL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'This check only runs against a local server.');
// Use the picker registry so newly supported languages also get coverage.
const languages = [...readFileSync(new URL('../lib/languages.ts', import.meta.url), 'utf8').matchAll(/code: '([^']+)'/g)].map(match => match[1]);
const s = await sandbox('imran', { baseURL, tokenFile: join(tmpdir(), `groundwork-bell-${origin.port || '80'}-sandbox-token`) });
const prior = await (await s.api.get('/api/me/preferences')).json();
const browser = await chromium.launch();
try {
  for (const language of languages) {
    const response = await s.api.patch('/api/me/preferences', { data: { language } });
    assert(response.ok(), `Could not set language ${language}`);
    const context = await browser.newContext({ viewport: { width: 360, height: 844 }, isMobile: true, hasTouch: true });
    try {
      await context.addCookies((await s.api.storageState()).cookies);
      // Only use saved translations during layout checks.
      await context.route('**/api/i18n/translate', route => route.continue({ postData: JSON.stringify({ ...route.request().postDataJSON(), cached_only: true }) }));
      const page = await context.newPage();
      await page.goto(`${baseURL}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.locator('.ds-rows .ds-row').first().waitFor();
      await page.locator('.notification-trigger button').click();
      await page.locator('.notification-read-all').waitFor();
      await page.waitForTimeout(1500);
      await page.evaluate(() => document.fonts.ready);
      const layout = await page.evaluate(() => {
        const title = document.querySelector('.dialog-header h2');
        const header = title.parentElement;
        const style = getComputedStyle(header);
        const natural = title.cloneNode(true);
        natural.style.cssText = 'position:fixed;visibility:hidden;width:max-content;max-width:none;white-space:nowrap';
        header.append(natural);
        const naturalWidth = natural.getBoundingClientRect().width;
        natural.remove();
        // Leave room for the 72px action, 44px close control and both gaps.
        const available = header.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 72 - 44 - 2 * parseFloat(style.columnGap);
        const wide = [...document.querySelectorAll('body *')].filter(element => {
          const rect = element.getBoundingClientRect();
          return rect.width && (rect.right > innerWidth + 1 || rect.left < -1);
        }).map(element => `${element.tagName}.${element.className}`);
        return { width: document.documentElement.scrollWidth, wide, titleFits: naturalWidth <= available, titleHeight: title.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(title).lineHeight), title: title.textContent };
      });
      assert.equal(layout.width, 360, `${language}: document overflow: ${JSON.stringify(layout)}`);
      assert.deepEqual(layout.wide, [], `${language}: elements outside viewport`);
      if (layout.titleFits) assert(layout.titleHeight <= layout.lineHeight + 1, `${language}: title should fit on one line`);
      console.log(`${language}: 360px, no overflow, title: ${layout.title}`);
    } finally { await context.close(); }
  }
} finally {
  await s.api.patch('/api/me/preferences', { data: { language: prior.language || 'en-IN' } });
  await browser.close();
  await s.api.dispose();
}
