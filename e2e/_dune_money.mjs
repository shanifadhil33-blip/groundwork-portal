// Local only (test database, DEMO_DUNE_HARBOUR=1): Dune Harbour Company overview money and Dipendra's first paint in Nepali.
import { chromium, request } from '@playwright/test';
const B='http://localhost:3100', OUT='/workspace/qa/chunk-oct18n';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});
const r=await api.post('/api/demo/start',{data:{persona:'imran',company:'dune_harbour'}}); if(r.status()!==201)throw new Error('start '+r.status());
let ws=(await r.json()).workspace_id;
if(process.env.RESET){const x=await api.post('/api/demo/reset',{data:{confirm:true}});console.log('reset',x.status());const r2=await api.post('/api/demo/start',{data:{persona:'imran',company:'dune_harbour'}});ws=(await r2.json()).workspace_id;}
const ov=await api.get(`/api/workspaces/${ws}/overview`).catch(()=>null);
console.log('overview api', ov?.status(), ov?await ov.text():'');
const br=await chromium.launch();
async function page(who,path,name){await api.post('/api/demo/switch',{data:{persona:who}});
 const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 await ctx.addCookies((await api.storageState()).cookies.filter(c=>c.path==='/').map(c=>({name:c.name,value:c.value,domain:'localhost',path:'/',secure:c.name.startsWith('__Secure'),httpOnly:c.httpOnly,sameSite:'Lax'})));
 const p=await ctx.newPage();const res=await p.goto(B+path,{waitUntil:'domcontentloaded'});const html=await res.text();
 const ssr={lang:/<html[^>]*lang="([^"]+)"/.exec(html)?.[1],hasScript:html.includes("d.lang="),preload:/rel="preload"[^>]*i18n/.test(html)||/i18n[^>]*rel="preload"/.test(html)};
 const first=await p.evaluate(()=>({lang:document.documentElement.lang,date:document.querySelector('h1 + p')?.textContent}));
 await p.waitForTimeout(3000);const body=await p.evaluate(()=>document.querySelector('.app-main')?.innerText.slice(0,400));
 await p.screenshot({path:`${OUT}/${name}.png`});console.log(name,JSON.stringify({ssr,first,body}));await ctx.close();}
await page('imran','/overview','dune-imran-overview');
await page('dipendra','/today','dune-dipendra-today-ne');
await br.close();
