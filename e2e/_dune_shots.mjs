// DEMO20 screenshots of Dune Harbour on a LOCAL server against the TEST database (DEMO_DUNE_HARBOUR=1 there only).
import { chromium, request } from '@playwright/test'; import fs from 'node:fs';
const B='http://localhost:3100', OUT='/workspace/qa/dune-shots';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});
const r=await api.post('/api/demo/start',{data:{persona:'imran',company:'dune_harbour'}}); if(r.status()!==201)throw new Error('start '+r.status()+' '+await r.text());
const ws=(await r.json()).workspace_id; console.log('workspace',ws);
const br=await chromium.launch();
const shot=async(who,path,name,{w=390,h=844,full=false}={})=>{
 const s=await api.post('/api/demo/switch',{data:{persona:who}}); if(s.status()!==200)throw new Error('switch '+who+' '+s.status());
 const ctx=await br.newContext({viewport:{width:w,height:h},deviceScaleFactor:w<500?2:1,isMobile:w<500,hasTouch:w<500});
 await ctx.addCookies((await api.storageState()).cookies.filter(c=>c.path==='/').map(c=>({name:c.name,value:c.value,domain:'localhost',path:'/',secure:c.name.startsWith('__Secure'),httpOnly:c.httpOnly,sameSite:'Lax'})));
 const pg=await ctx.newPage(); await pg.goto(B+path,{waitUntil:'networkidle',timeout:60000}).catch(()=>{}); await pg.waitForTimeout(3500);
 await pg.screenshot({path:`${OUT}/${name}.png`,fullPage:full}); console.log(name, pg.url().replace(B,'')); await ctx.close();
};
await shot('joseph','/team','1-joseph-team-12-technicians',{w:1280,h:1100});
//await shot('imran','/home','2-imran-owner-home-gulf-arabic');
//await shot('dipendra','/today','3-dipendra-today-nepali');
//await shot('kevin','/home','4-kevin-clinic-tamil');
//await shot('joseph','/work-orders','5-joseph-jobs-laptop',{w:1280,h:800});
await br.close();
