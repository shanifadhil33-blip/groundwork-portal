import { request } from '@playwright/test';
const B='https://groundwork-portal.vercel.app';const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});
const s=await api.post('/api/demo/start',{data:{persona:'ravi'}});console.log('start',s.status(),(await s.text()).slice(0,200));
const w=await api.post('/api/demo/switch',{data:{persona:'ravi'}});console.log('switch',w.status(),(await w.text()).slice(0,200));
