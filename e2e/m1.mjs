import { chromium, request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app',O='/workspace/qa/shots-cmp';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});await api.post('/api/demo/start',{data:{persona:'imran'}});await api.post('/api/demo/switch',{data:{persona:'imran'}});
const br=await chromium.launch();const c=await br.newContext({viewport:{width:1440,height:900},permissions:['microphone']});await c.addCookies((await api.storageState()).cookies);const pg=await c.newPage();
await pg.goto(B+'/dashboard',{waitUntil:'networkidle'});await pg.waitForTimeout(1500);
console.log('mic buttons',await pg.getByRole('button',{name:'Use microphone'}).count(),'agent input',await pg.getByLabel('Ask Agent').count());await pg.screenshot({path:O+'/m1-imran.png'});
console.log('prefs',JSON.stringify(await (await api.get('/api/me/preferences')).json()).slice(0,300));
await api.post('/api/demo/reset',{data:{confirm:true}}).catch(()=>{});await br.close();
