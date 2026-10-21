// Desert Stone: sign in page at 390 and 360, no session.
import { chromium } from '@playwright/test'; import { B } from './sandbox.mjs';
const br = await chromium.launch(); for (const w of [390, 360]) { const p = await (await br.newContext({ viewport: { width: w, height: 800 }, isMobile: true })).newPage(); await p.goto(B + '/sign-in', { waitUntil: 'networkidle' }); const sw = await p.evaluate(() => document.documentElement.scrollWidth); await p.screenshot({ path: `/workspace/qa/desert-stone-live/ds7b/sign-in-${w}.png` }); console.log(w, sw); } await br.close();
