// Local only: node e2e/lang12-sweep.mjs --out=/tmp/lang12/before.json
// Static language files only: no live deployment, AI translation, or shared token file.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, expect } from '@playwright/test';
import { hasUntranslatedLatin as latin } from './lang12-detection.mjs';
import { sandbox } from './sandbox.mjs';

const option = (name, fallback) => process.argv.find(x => x.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const baseURL = option('base', 'http://127.0.0.1:3000');
const origin = new URL(baseURL);
assert(['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname), 'LANG12 only runs locally');
const out = option('out', '/tmp/lang12-sweep.json');
const personas = ['imran', 'hassan', 'sam', 'ravi', 'pranav', 'faisal', 'omar', 'nabil', 'kevin'];
const selected = option('roles', personas.join(',')).split(',').filter(p=>personas.includes(p));
const staticRoutes = fs.readdirSync(new URL('../app/(app)/', import.meta.url), { recursive: true })
  .filter(p => /(^|\/)page\.tsx$/.test(p) && !p.includes('['))
  .map(p => '/' + p.replace(/\/page\.tsx$/, ''));
const s = await sandbox('imran', { baseURL, tokenFile: join(tmpdir(), `groundwork-lang12-${origin.port || '80'}-token`) });
const browser = await chromium.launch();
const report = { baseURL, viewport: { width: 360, height: 844 }, translationMode: 'static files only; translation API stubbed empty', roles: [], isolation: null };
async function contextFor(persona, language) {
  // Starting with the existing sandbox creates a concurrent session; switching intentionally revokes every session in that demo.
  assert((await s.api.post('/api/demo/start', {data:{persona}})).ok(), `session ${persona}`);
  assert((await s.api.patch('/api/me/preferences', { data: { language } })).ok(), `language ${persona}`);
  const context = await browser.newContext({ viewport: report.viewport, isMobile: true, hasTouch: true, locale: language });
  await context.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = 'nextjs-portal{display:none!important}'; document.head.append(style); }); });
  await context.addCookies((await s.api.storageState()).cookies);
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin !== origin.origin) return route.abort();
    if (url.pathname === '/api/i18n/translate') return route.fulfill({ json: { translations: {} } });
    return route.continue();
  });
  return context;
}
async function capture(page, path, variant = '') {
  // Wait for route data and lazy chunks before giving the DOM translator its debounce window.
  await page.waitForLoadState('networkidle', { timeout: 30000 });
  await page.waitForTimeout(2200);
  await page.waitForFunction(() => !document.documentElement.hasAttribute('data-translating'), undefined, { timeout: 5000 }).catch(() => {});
  const snapshot = await page.evaluate(() => {
    const visible = element => {
      const r = element.getBoundingClientRect(), style = getComputedStyle(element);
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !element.closest('script,style,code,pre,[aria-hidden="true"],nextjs-portal');
    };
    const nodes = [], attributes = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (node.parentElement && !node.parentElement.closest('textarea,input,[contenteditable]:not([contenteditable="false"])') && visible(node.parentElement) && node.data.trim()) nodes.push(node.data.trim());
    }
    for (const el of document.querySelectorAll('[placeholder],[aria-label],[title],[alt]')) {
      if (visible(el)) for (const a of ['placeholder', 'aria-label', 'title', 'alt']) if (el.getAttribute(a)) attributes.push(el.getAttribute(a));
    }
    const containers = [...document.querySelectorAll('html,body,.app-main,#app-content,[role="dialog"]')];
    return { dir: document.documentElement.dir, lang: document.documentElement.lang, width: innerWidth,
      overflow: containers.filter(el => el.scrollWidth > el.clientWidth + 1).map(el => ({ element: el.tagName + '.' + el.className, scroll: el.scrollWidth, client: el.clientWidth })),
      lines: [...new Set(nodes)], nodes: [...new Set(nodes)], attributes: [...new Set(attributes)],
      links: [...document.querySelectorAll('a[href^="/"]')].map(a => a.getAttribute('href')) };
  });
  return { path, variant, url: new URL(page.url()).pathname, dir: snapshot.dir, lang: snapshot.lang, overflow: snapshot.overflow,
    leaks: snapshot.lines.filter(latin), attributes: snapshot.attributes.filter(latin), sources: snapshot.nodes.filter(latin), links: snapshot.links };
}
try {
  for (const who of selected) {
    const context = await contextFor(who, 'ar-AE');
    const page = await context.newPage();
    const role = { persona: who, pages: [], denied: [], errors: [] };
    const queue = option('paths', '').length ? option('paths', '').split(',') : [...staticRoutes];
    const seen = new Set();
    let job = null, client = false;
    while (queue.length) {
      const path = queue.shift();
      if (seen.has(path)) continue;
      console.log(who, path);
      seen.add(path);
      try {
        await page.goto(baseURL + path, { waitUntil: 'load', timeout: 60000 });
        const result = await capture(page, path);
        // Closed role pages are recorded, not silently counted as successfully swept.
        const denied = await page.locator('.error-page h1').filter({ hasText: /You can’t open this page|ما تقدر تفتح|لا يمكنك فتح|ليس لديك/ }).count();
        if (denied) { role.denied.push(path); continue; }
        role.pages.push(result);
        for (const link of result.links) {
          const target = link.split('?')[0];
          if (/^\/work-orders\/[0-9a-f-]{36}$/.test(target) && !job) { job = target; queue.push(target, target + '/edit'); }
          if (/^\/clients\/[0-9a-f-]{36}$/.test(target) && !client) { client = true; queue.push(target); }
          if (!option('paths', '') && staticRoutes.includes(target) && !seen.has(target)) queue.push(target);
        }
        if (path === '/settings') {
          const tabs = await page.getByRole('tab').count();
          for (let index = 0; index < tabs; index++) {
            const tab = page.getByRole('tab').nth(index);
            await tab.click();
            // Next may retain an inactive settings tree during navigation; scope to the visible tab.
            await expect(page.getByRole('tab').nth(index)).toHaveAttribute('aria-selected', 'true', {timeout: 30000});
            await page.waitForTimeout(300);
            role.pages.push(await capture(page, path, 'tab:' + (new URL(page.url()).searchParams.get('tab') || index)));
          }
        }
        if (path === '/work-orders') {
          await page.locator('.notification-trigger button').click();
          await page.locator('.notification-read-all').waitFor({ timeout: 10000 });
          role.pages.push(await capture(page, path, 'bell open'));
          await page.goto(baseURL + path, { waitUntil: 'load' });
          await page.locator('.bottom-tabs button').last().click();
          role.pages.push(await capture(page, path, 'navigation open'));
          await page.goto(baseURL + path, { waitUntil: 'load' });
        }
      } catch (error) { role.errors.push({ path, message: error.message.split('\n')[0] }); }
    }
    await page.goto(baseURL + '/work-orders/00000000-0000-4000-8000-000000000000', { waitUntil: 'load', timeout: 60000 });
    role.pages.push(await capture(page, '/work-orders/00000000-0000-4000-8000-000000000000', 'missing job'));
    role.counts = { screens: role.pages.length, lines: role.pages.reduce((n, p) => n + p.leaks.length, 0), uniqueLines: new Set(role.pages.flatMap(p => p.leaks)).size,
      attributes: role.pages.reduce((n, p) => n + p.attributes.length, 0), rtlFailures: role.pages.filter(p => p.dir !== 'rtl').length, overflowFailures: role.pages.filter(p => p.overflow.length).length };
    report.roles.push(role);
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
    console.log(who, JSON.stringify(role.counts), 'errors:', role.errors.length);
    await context.close();
    await s.api.patch('/api/me/preferences', { data: { language: 'en-IN' } });
  }
  if (option('skip-isolation', 'false') !== 'true') {
  // Separate concurrent sessions in the SAME sandbox, on the SAME permitted job.
  const arabic = await contextFor('imran', 'ar-AE');
  const english = await contextFor('hassan', 'en-IN');
  const ar = await arabic.newPage(), en = await english.newPage();
  const listResponse = await s.api.get(`/api/workspaces/${s.ws}/work-orders`);
  assert(listResponse.ok(), `same-job list: ${listResponse.status()}`);
  const list = await listResponse.json();
  const job = list.data[0].id;
  await Promise.all([ar.goto(`${baseURL}/work-orders/${job}`, {waitUntil:'domcontentloaded',timeout:60000}), en.goto(`${baseURL}/work-orders/${job}`, {waitUntil:'domcontentloaded',timeout:60000})]);
  const [a, e] = await Promise.all([capture(ar, 'same job'), capture(en, 'same job')]);
  report.isolation = { sameJob: true, differentUsers: true, arabic: { lang: a.lang, dir: a.dir, heading: await ar.locator('h1').innerText() }, english: { lang: e.lang, dir: e.dir, heading: await en.locator('h1').innerText() },
    preferences: [await ar.evaluate(async()=> (await (await fetch('/api/me/preferences')).json()).language), await en.evaluate(async()=> (await (await fetch('/api/me/preferences')).json()).language)] };
  assert.equal(a.lang, 'ar-AE'); assert.equal(a.dir, 'rtl'); assert.equal(e.lang, 'en-IN'); assert.equal(e.dir, 'ltr');
  assert.match(await en.locator('body').innerText(), /Back to jobs|Job details|Activity|Overview/);
  assert.deepEqual(report.isolation.preferences, ['ar-AE', 'en-IN']);
  await ar.evaluate(async()=> { await fetch('/api/me/preferences', {method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({language:'en-IN'})}); });
  await arabic.close(); await english.close();
  }
} finally {
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  await browser.close(); await s.api.dispose();
}
console.log('Saved', out);
if (report.roles.some(r => r.errors.length || r.counts.lines || r.counts.attributes || r.counts.rtlFailures || r.counts.overflowFailures)) process.exitCode = 1;
