// AI13 live screenshot: Pranav asks the Agent about a waiting price (fixed sandbox, lesson 39).
import { chromium } from '@playwright/test'; import { sandbox, B } from './sandbox.mjs';
const s=await sandbox('imran'); await s.as('pranav');
const br=await chromium.launch(); const ctx=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
await ctx.addCookies((await s.api.storageState()).cookies); const pg=await ctx.newPage();
await pg.goto(B+'/home',{waitUntil:'networkidle'}); await pg.getByRole('button',{name:/^Agent$/}).first().click(); await pg.waitForTimeout(1500);
const box=pg.getByRole('textbox').last(); await box.fill('Is there a price waiting for me?'); await box.press('Enter');
await pg.waitForFunction(()=>/AED\s?\d/.test(document.body.innerText),null,{timeout:90000}).catch(()=>{}); await pg.waitForTimeout(1500);
await pg.screenshot({path:'/workspace/qa/dune-shots/6-live-agent-price-pranav.png'}); console.log((await pg.locator('body').innerText()).match(/[^\n]*AED[^\n]*/g)); await br.close();
