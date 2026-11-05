// Start a local server, then run: BASE_URL=http://localhost:3000 node scripts/capture-landing.mjs
// Requires the existing e2e Playwright install, its Chromium browser and ffmpeg.
import { chromium } from '../e2e/node_modules/playwright/index.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const base = process.env.BASE_URL ?? 'http://localhost:3000';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname)) throw new Error('Use a local demo server.');
const temporary = await mkdtemp(join(tmpdir(), 'groundwork-landing-'));
const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream'] });
const origin = new URL(base).origin;
async function prepare(context) {
 await context.route('**/*', route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin) return route.abort();
  if (/\/assistant(?:\/|$)|\/api\/i18n\/translate/.test(url.pathname)) return route.fulfill({json:{data:[],suggestions:[],translations:{},available:true}});
  return route.continue();
 });
 const page = await context.newPage();
 await page.addInitScript(() => { localStorage.setItem('groundwork-theme','light'); });
 return page;
}
async function capture(page, name) {
 await page.evaluate(() => document.fonts.ready);
 await page.addStyleTag({content:'nextjs-portal{display:none!important}'});
 if (/\bWO(?:\b|[- ]\d)/.test(await page.locator('body').innerText())) throw new Error(`Retired wording in ${name}`);
 const path = join(temporary, `${name}.png`);
 await page.screenshot({path});
 execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',path,'-c:v','libwebp','-quality','88','-frames:v','1',new URL(`../public/landing/${name}.webp`,import.meta.url).pathname]);
}
try {
 const desktop = await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const page = await prepare(desktop);
 await page.goto(`${base}/demo`);
 await page.getByRole('button',{name:/Continue as Imran/}).click();
 await page.waitForURL('**/dashboard');
 await page.getByRole('button',{name:'Not now',exact:true}).click({timeout:3000}).catch(()=>{});
 await page.waitForTimeout(1000);
 await capture(page,'dashboard');
 const phone = await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,storageState:await desktop.storageState(),permissions:['microphone']});
 const mobile = await prepare(phone);
 await phone.request.patch(`${base}/api/me/preferences`,{data:{language:'hi',voice_enabled:true,agent_name:'आरिफ'}});
 await mobile.addInitScript(()=>{localStorage.setItem('gwAgentInputMode','voice');window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined;});
 await mobile.goto(`${base}/dashboard`);
 await mobile.getByRole('button',{name:'अभी नहीं',exact:true}).click({timeout:3000}).catch(()=>{});
 await mobile.locator('.phone-assistant').click();
 await mobile.locator('#assistant-input').fill('आज के काम दिखाएँ');
 await mobile.locator('.assistant-composer .assistant-control').first().click();
 await mobile.locator('.voice-recording').waitFor();
 await capture(mobile,'voice-hindi');
 console.log('Updated public/landing/dashboard.webp and public/landing/voice-hindi.webp');
} finally { await browser.close(); await rm(temporary,{recursive:true,force:true}); }
