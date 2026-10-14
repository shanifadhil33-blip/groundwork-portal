import { chromium, request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app',O='/workspace/qa/walk-oct14/more';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});await api.post('/api/demo/start',{data:{persona:'imran'}});
const br=await chromium.launch();const issues=[];
for(const p of ['imran','sam','ravi','nabil','pranav','omar','kevin','faisal']){
 await api.post('/api/demo/switch',{data:{persona:p}});const cookies=(await api.storageState()).cookies;
 for(const [tag,vp] of [['phone',{width:390,height:844,isMobile:true,hasTouch:true}],['laptop',{width:1440,height:900}]]){
  const c=await br.newContext({viewport:{width:vp.width,height:vp.height},isMobile:!!vp.isMobile,hasTouch:!!vp.hasTouch});await c.addCookies(cookies);const pg=await c.newPage();
  const errs=[];pg.on('response',r=>{if(r.status()>=500||(r.status()>=400&&r.status()!==401&&r.url().includes('/api/')&&r.request().method()==='GET'))errs.push(r.status()+' '+r.url().replace(B,''));});pg.on('pageerror',e=>errs.push('JS '+e.message.slice(0,120)));
  await pg.goto(B+'/home',{waitUntil:'networkidle'}).catch(()=>{});await pg.waitForTimeout(800);
  const links=[...new Set(await pg.evaluate(()=>[...document.querySelectorAll('a.nav-link,.bottom-tabs a,nav a')].map(a=>a.getAttribute('href')).filter(h=>h&&h.startsWith('/')&&!h.startsWith('/api'))))];
  for(const h of ['/team-space','/team','/clients','/messages','/suggestions','/queue','/documents','/supplier','/audit','/import','/invites','/overview']){errs.length=0;await pg.goto(B+h,{waitUntil:'networkidle'}).catch(e=>errs.push('NAV '+e.message.slice(0,60)));await pg.waitForTimeout(700);
   const chk=await pg.evaluate(()=>{const t=document.body.innerText;const small=[...document.querySelectorAll('body *')].filter(e=>e.childElementCount===0&&e.textContent.trim()&&getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().width>0&&parseFloat(getComputedStyle(e).fontSize)<14).map(e=>e.textContent.trim().slice(0,20)).slice(0,3);return {over:document.documentElement.scrollWidth>innerWidth+1,broken:/something went wrong|couldn.t load|not found|can.t answer|dispatch/i.test(t)?t.match(/[^\n]*(something went wrong|couldn.t load|not found|can.t answer|dispatch)[^\n]*/i)[0].slice(0,80):'',small,dash:(t.match(/\w - \w|\w — \w|\w – \w/)||[''])[0]};});
   const name=`${p}-${tag}${h.replace(/[\/?=&]/g,'-')}.png`;await pg.screenshot({path:`${O}/${name}`});
   const bad=[...errs];if(chk.over)bad.push('horizontal overflow');if(chk.broken)bad.push('text: '+chk.broken);if(chk.small.length)bad.push('small text: '+chk.small.join(' | '));if(chk.dash)bad.push('dash: '+chk.dash);
   if(bad.length)issues.push(`${p} ${tag} ${h}: ${bad.join('; ')}`);}
  await c.close();}
}
console.log(issues.join('\n')||'NO ISSUES');await api.post('/api/demo/reset',{data:{confirm:true}}).catch(()=>{});await br.close();process.exit(0);
console.log(issues.join('\n')||'NO ISSUES');
