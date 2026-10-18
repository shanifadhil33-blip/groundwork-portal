import { chromium } from 'playwright';
import { sandbox } from '/workspace/portal-hero/e2e/sandbox.mjs';
const B='https://groundwork-portal.vercel.app';
const routes=['/dashboard','/home','/today','/overview','/work-orders','/work-orders/new','/suggestions','/suggestions/new','/schedule','/messages','/team','/team-space','/clients','/queue','/documents','/audit','/import','/invites','/supplier','/settings','/how-agent-works','/isolation'];
const br=await chromium.launch(); const bad=[];
for (const who of ['imran','sam','nabil','ravi','pranav','kevin','omar','faisal']) {
  const s=await sandbox(who); await s.as(who);
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await ctx.addCookies((await s.api.storageState()).cookies);
  const p=await ctx.newPage(); let errs=[]; p.on('pageerror',e=>errs.push(e.message.slice(0,120)));
  for (const r of routes){ errs=[]; await p.goto(B+r,{waitUntil:'load',timeout:45000}).catch(()=>{}); await p.waitForTimeout(1800);
    const t=(await p.innerText('body').catch(()=>'')); const crash=/couldn.t open this page|couldn.t open your workspace/i.test(t);
    const ov=await p.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1);
    if(crash||errs.length||ov){bad.push({who,r,url:p.url().replace(B,''),crash,ov,errs:errs.slice(0,2)});}
  }
  console.log(who,'done'); await ctx.close();
}
console.log(JSON.stringify(bad,null,1)); await br.close();
