// Final audit: Agent permission and action probes. 6 live AI questions. Writes /workspace/qa/audit-agent.json
import fs from 'node:fs'; import { sandbox } from './sandbox.mjs';
const s=await sandbox('imran'); const ws=s.ws; const out=[];
const api=async(m,path,data)=>{const r=await s.api.fetch(`/api/workspaces/${ws}${path}`,{method:m,data,timeout:120000});let b=null;try{b=await r.json();}catch{}return {st:r.status(),b};};
const as=async p=>{const r=await s.as(p);if(r.status()!==200)throw new Error('switch '+p);};
const list=b=>Array.isArray(b)?b:b?.data??[];
const ask=async(who,q)=>{await as(who);const r=await api('POST','/assistant',{messages:[{role:'user',content:q}]});return r;};
const brief=r=>({st:r.st,reply:String(r.b?.reply??'').slice(0,300),action:r.b?.action?{tool:r.b.action.tool,summary:r.b.action.summary??r.b.action.label}:r.b?.pending_action??null,keys:Object.keys(r.b??{})});
const day=k=>new Date(Date.now()+k*864e5).toISOString().slice(0,10);
await as('faisal'); const fs1=list((await api('GET','/request-sites')).b)[0];
const req=await api('POST','/work-orders',{title:'Bathroom fan noisy',site_id:fs1.id,description:'Fan rattles',preferred_window:'Sunday morning'});
// Q1 household tries to assign
let r=await ask('faisal','Please assign my Bathroom fan noisy request to Ravi for tomorrow.'); out.push({q:'household asks to assign',...brief(r)});
// Q2 household withdraws
r=await ask('faisal','I fixed the bathroom fan myself. Please withdraw that request.'); out.push({q:'household withdraws',...brief(r)});
const card=r.b?.action?.id??r.b?.pending_action?.id;
if(card){const c=await api('POST','/assistant',{messages:[{role:'user',content:'Yes'}],confirm_action_id:card});out.push({q:'confirm withdraw',...brief(c)});}
const left=list((await api('GET','/suggestions')).b).some(x=>x.id===req.b?.id); out.push({q:'request gone after withdraw',ok:!left});
// Q3 technician tries to cancel
await as('ravi'); const rj=list((await api('GET','/work-orders?pageSize=20')).b).find(j=>['scheduled','in_progress'].includes(j.status));
r=await ask('ravi',`Cancel the job ${rj?.title}. The client does not need it.`); out.push({q:'technician asks to cancel',job:rj?.title,...brief(r)});
// Q4 office staff approves leave
r=await ask('nabil','Approve any leave request that is waiting.'); out.push({q:'office staff approves leave',...brief(r)});
// Q5 supervisor reschedules
await as('sam'); const sj=list((await api('GET','/work-orders?status=scheduled&pageSize=5')).b)[0];
r=await ask('sam',`Move the visit for ${sj?.title} to ${day(9)}.`); out.push({q:'supervisor reschedules',job:sj?.title,...brief(r)});
// Q6 household answers a price
await as('faisal'); const myReq=await api('POST','/work-orders',{title:'Kitchen sink drain slow',site_id:fs1.id,description:'Drain slow',preferred_window:'Sunday morning'});
await as('sam'); const appr=await api('POST',`/suggestions/${myReq.b?.id}`,{decision:'approved'}); await api('POST',`/work-orders/${appr.b?.work_order_id}/quote`,{amount:180});
r=await ask('faisal','Yes, I approve the price for the kitchen sink drain.'); out.push({q:'household answers price',...brief(r)});
fs.writeFileSync('/workspace/qa/audit-agent.json',JSON.stringify(out,null,1)); for(const o of out)console.log(JSON.stringify(o).slice(0,520));
