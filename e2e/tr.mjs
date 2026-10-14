import { request } from '@playwright/test';import fs from 'fs';
const B='https://groundwork-portal.vercel.app';const api=await request.newContext({baseURL:B,extraHTTPHeaders:{origin:B}});
await api.post('/api/demo/start',{data:{persona:'imran'}});await api.post('/api/demo/switch',{data:{persona:'imran'}});
const ws=(await (await api.get('/api/me')).json()).memberships[0].workspace_id;
const r=await api.post(`/api/workspaces/${ws}/assistant/transcribe`,{multipart:{audio:{name:'recording',mimeType:'audio/webm',buffer:fs.readFileSync('/tmp/say.webm')},duration:'2'}});console.log(r.status(),await r.text());
await api.post('/api/demo/reset',{data:{confirm:true}}).catch(()=>{});
