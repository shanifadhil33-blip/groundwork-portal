import { chromium, request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app',O='/workspace/qa/shots-cmp';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});await api.post('/api/demo/start',{data:{persona:'ravi'}});await api.post('/api/demo/switch',{data:{persona:'ravi'}});
const ws=(await (await api.get('/api/me')).json()).memberships[0].workspace_id;
const m=[{role:'user',content:'The client wants me to also replace the shower head while I am here. I am not sure if that is allowed or what to charge. Ask my supervisor.'},{role:'assistant',content:'Send question to supervisor about replacing the shower head?'},{role:'user',content:'Yes'},{role:'assistant',content:'Which job is this for?'},{role:'user',content:'WO 13'}];
const r=await (await api.post(`/api/workspaces/${ws}/assistant`,{data:{messages:m}})).json();console.log('agent',JSON.stringify(r).slice(0,700));
const id=JSON.stringify(r).match(/"(?:action_id|id)":"([0-9a-f-]{36})"/)?.[1];
if(id){const ok=await api.post(`/api/workspaces/${ws}/assistant`,{data:{messages:m,confirm_action_id:id}});console.log('confirm',ok.status(),(await ok.text()).slice(0,300));}
await api.post('/api/demo/switch',{data:{persona:'sam'}});console.log('sam list',JSON.stringify(await (await api.get(`/api/workspaces/${ws}/agent-questions`)).json()).slice(0,400));

const br=await chromium.launch();const c=await br.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});await c.addCookies((await api.storageState()).cookies);const pg=await c.newPage();
await pg.goto(B+'/dashboard',{waitUntil:'networkidle'});await pg.waitForTimeout(1500);await pg.screenshot({path:O+'/team09-sam.png'});
const yes=pg.getByRole('button',{name:'Yes, approve'});if(await yes.count()){await yes.first().click();await pg.waitForTimeout(1500);}else{await pg.getByRole('button',{name:'Answer'}).first().click();await pg.getByLabel('The right answer').fill('Yes, replace it. Charge 80 AED fitted.');await pg.screenshot({path:O+'/team09-answer.png'});await pg.getByRole('button',{name:'Send answer'}).click();await pg.waitForTimeout(1500);}
await api.post('/api/demo/switch',{data:{persona:'ravi'}});console.log('ravi sees',JSON.stringify(await (await api.get(`/api/workspaces/${ws}/agent-questions`)).json()).slice(0,300));
await api.post('/api/demo/reset',{data:{confirm:true}}).catch(()=>{});await br.close();
