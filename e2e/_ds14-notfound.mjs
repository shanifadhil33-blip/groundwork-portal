import { chromium } from '@playwright/test';
const b=await chromium.launch(); const tag=process.argv[2]||'before';
for (const [w,loc] of [[360,'en-US'],[390,'ar-AE'],[1440,'en-US'],[390,'hi-IN']]) { const c=await b.newContext({viewport:{width:w,height:800},locale:loc,isMobile:w<1000,hasTouch:w<1000,deviceScaleFactor:w<1000?2:1}); const p=await c.newPage(); await p.goto('https://groundwork-portal.vercel.app/no-such-page-x',{waitUntil:'networkidle'}); await p.waitForTimeout(1500); await p.screenshot({path:`/workspace/qa/desert-stone-live/ds14/notfound-${tag}-${w}-${loc}.png`}); console.log(w,loc,await p.evaluate(()=>[document.documentElement.lang,document.documentElement.scrollWidth,innerWidth,document.querySelector('main')?.innerText.slice(0,120)])); await c.close(); }
await b.close();
