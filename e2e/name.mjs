import { chromium, request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app',O='/workspace/qa/shots-cmp';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});await api.post('/api/demo/start',{data:{persona:'ravi'}});await api.post('/api/demo/switch',{data:{persona:'ravi'}});
const br=await chromium.launch();const c=await br.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});await c.addCookies((await api.storageState()).cookies);const pg=await c.newPage();
await pg.goto(B+'/today',{waitUntil:'networkidle'});await pg.waitForTimeout(1200);await pg.screenshot({path:O+'/name-ask.png'});
console.log('ask',await pg.getByText('What should I call you?').count());await pg.locator('.name-ask input').fill('Ravi bhai');await pg.getByRole('button',{name:'Save'}).click();await pg.waitForTimeout(1500);
console.log('greeting',await pg.locator('.greeting').innerText());await pg.screenshot({path:O+'/name-greeting.png'});
await pg.reload({waitUntil:'networkidle'});await pg.waitForTimeout(800);console.log('ask again',await pg.getByText('What should I call you?').count());
await api.post('/api/demo/reset',{data:{confirm:true}}).catch(()=>{});await br.close();
