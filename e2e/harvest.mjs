// LANG: collect every visible UI string per persona (English) for the pre-translation batch. Uses the fixed sandbox.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const s=await sandbox('imran'); const all=new Set(); const br=await chromium.launch();
const grab=()=>{const out=[];const skip='script,style,code,pre,textarea,[data-no-translate],[contenteditable]:not([contenteditable="false"])';
 const w=document.createTreeWalker(document.body,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT);let n;
 while((n=w.nextNode())){if(n.nodeType===3){if(!n.parentElement?.closest(skip))out.push(n.data);}else{for(const a of ['placeholder','aria-label','title','alt','data-label']){const v=n.getAttribute(a);if(v&&!n.closest(skip.replace('textarea,','')))out.push(v);}}}return out;};
const tabs=async p=>{for(const t of await p.getByRole('tab').all()){await t.click().catch(()=>{});await p.waitForTimeout(500);(await p.evaluate(grab)).forEach(x=>all.add(x));}};
for(const who of ['imran','sam','ravi','nabil','pranav','kevin','omar','faisal']){
 await s.as(who); for(const w of (who==='imran'||who==='sam'?[390,1280]:[390])){
 const ctx=await br.newContext({viewport:{width:w,height:844}}); await ctx.addCookies((await s.api.storageState()).cookies); const p=await ctx.newPage();
 const seen=new Set(), q=['/today','/dashboard','/home','/work-orders','/settings','/settings/agent','/schedule','/messages','/team','/clients','/suggestions','/queue','/documents','/overview','/how-agent-works','/supplier','/import','/audit','/team-space','/invites'];
 while(q.length&&seen.size<30){const path=q.shift();if(seen.has(path))continue;seen.add(path);
  try{await p.goto(B+path,{waitUntil:'load',timeout:30000});await p.waitForTimeout(1200);(await p.evaluate(grab)).forEach(x=>all.add(x));
   if(path==='/settings')await tabs(p);
   const links=await p.evaluate(()=>[...document.querySelectorAll('a[href^="/"]')].map(a=>a.getAttribute('href').split('?')[0]));
   for(const l of links){const k=l.replace(/[0-9a-f-]{36}/g,':id');if(![...seen].some(x=>x.replace(/[0-9a-f-]{36}/g,':id')===k)&&!q.includes(l)&&!/logout|api|signout/.test(l))q.push(l);}
  }catch{}}
 await ctx.close();} console.log(who,all.size);
}
for(const path of ['/','/demo','/privacy','/login','/signup']){const ctx=await br.newContext();const p=await ctx.newPage();try{await p.goto(B+path,{waitUntil:'load'});await p.waitForTimeout(1000);(await p.evaluate(grab)).forEach(x=>all.add(x));}catch{};await ctx.close();}
const src=[...new Set([...all].map(t=>t.trim()).filter(t=>t&&t.length<=500&&/\p{L}/u.test(t)))];
fs.writeFileSync('/workspace/qa/i18n/strings.json',JSON.stringify(src,null,0));console.log('strings',src.length);await br.close();
