import { chromium, request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app',O='/workspace/qa/shots-cmp';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});await api.post('/api/demo/start',{data:{persona:'sam'}});await api.post('/api/demo/switch',{data:{persona:'sam'}});
const br=await chromium.launch();const c=await br.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});await c.addCookies((await api.storageState()).cookies);const pg=await c.newPage();
await pg.goto(B+'/dashboard',{waitUntil:'networkidle'});await pg.waitForTimeout(1000);
const btn=pg.getByRole('button',{name:'Reassign'}).first();console.log('reassign buttons',await pg.getByRole('button',{name:'Reassign'}).count());
if(await btn.count()){await btn.scrollIntoViewIfNeeded();await btn.click();await pg.waitForTimeout(800);await pg.screenshot({path:O+'/reassign-sheet.png'});
const give=pg.getByRole('button',{name:/^Give to/}).first();const label=await give.textContent();await give.click();await pg.waitForTimeout(1500);
console.log('clicked',label,'sheet open',await pg.getByRole('button',{name:/^Give to/}).count(),'alert',await pg.getByRole('alert').allTextContents());await pg.screenshot({path:O+'/reassign-after.png'});}
await api.post('/api/demo/reset',{data:{confirm:true}}).catch(()=>{});await br.close();
