import { chromium, request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app',O='/workspace/qa/shots-cmp';
const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});await api.post('/api/demo/start',{data:{persona:'ravi'}});await api.post('/api/demo/switch',{data:{persona:'ravi'}});
const ws=(await (await api.get('/api/me')).json()).memberships[0].workspace_id;
const r=await (await api.post(`/api/workspaces/${ws}/assistant`,{data:{messages:[{role:'user',content:'The client wants me to also replace the shower head while I am here. I am not sure if that is allowed or what to charge. Ask my supervisor.'}]}})).json();
console.log('agent',JSON.stringify(r).slice(0,500));
if(r.pending?.id||r.action?.id){const id=r.pending?.id??r.action?.id;const ok=await api.post(`/api/workspaces/${ws}/assistant/actions/${id}`,{data:{decision:'approve'}});console.log('confirm',ok.status(),(await ok.text()).slice(0,200));}
await api.post('/api/demo/switch',{data:{persona:'sam'}});console.log('sam list',JSON.stringify(await (await api.get(`/api/workspaces/${ws}/agent-questions`)).json()).slice(0,300));
const br=await chromium.launch();const c=await br.newContext({viewport:{width:360,height:640},isMobile:true,hasTouch:true});await c.addCookies((await api.storageState()).cookies);const pg=await c.newPage();
await pg.goto(B+'/dashboard',{waitUntil:'networkidle'});await pg.waitForTimeout(1500);await pg.screenshot({path:O+'/team09-sam.png'});
await br.close();console.log('KEEP');
