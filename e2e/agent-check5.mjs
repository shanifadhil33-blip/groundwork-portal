if (process.env.RUN_ASSISTANT_QA !== '1') { console.log('Skipping live assistant QA during the build freeze'); process.exit(0); }
// Short live Agent check: 5 AI questions at most. Prints each answer, its time and whether the outcome was right.
import fs from 'node:fs'; import { sandbox } from './sandbox.mjs';
const s=await sandbox('imran'); const ws=s.ws; const out=[];
const api=async(m,p,d)=>{const t=Date.now();try{const r=await s.api.fetch(`/api/workspaces/${ws}${p}`,{method:m,data:d,timeout:90000});let b=null;try{b=await r.json();}catch{}return {st:r.status(),b,ms:Date.now()-t};}catch{return {st:0,b:null,ms:Date.now()-t};}};
const as=async p=>{await s.as(p);};
const list=b=>Array.isArray(b)?b:b?.data??[];
const FALLBACK=/You can also ask about today|I could not do that right now|I can show today's jobs/;
const ask=async(who,q,ok)=>{await as(who);const r=await api('POST','/assistant',{messages:[{role:'user',content:q}]});const a=r.b?.pending_action;const o={who,q,ms:r.ms,st:r.st,ai:r.st===200&&(!!a||!FALLBACK.test(String(r.b?.reply??''))),tool:a?.tool??null,provider:r.b?.provider??null,full:String(r.b?.reply??a?.summary??''),reply:String(r.b?.reply??a?.summary??'').slice(0,220)};o.right=o.ai&&ok(o);const full=o.full;delete o.full;out.push(o);console.log(JSON.stringify(o));if(!o.right&&full.length>220)console.log('  full reply:',full.replace(/\n/g,' '));};
const day=k=>new Date(Date.now()+k*864e5).toISOString().slice(0,10);
await as('faisal'); const site=list((await api('GET','/request-sites')).b)[0];
await api('POST','/work-orders',{title:'Garden tap leaking',site_id:site.id,description:'Drips all night',preferred_window:'Sunday morning'});
await ask('ravi','What do I have today?',o=>!o.tool);
// AI13: the price must come with its own job: the WO number and title of the job that carries that amount, and no other job title next to that number.
await as('pranav'); const mine=list((await api('GET','/work-orders?pageSize=100')).b); const priced=mine.filter(j=>j.quote_status==='pending'&&j.quote_amount!=null);
const amount=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const titled=(text,j)=>new RegExp(`WO[\\s-]?${j.order_number}\\b[^\\n]{0,12}${j.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i').test(text);
const wrongTitle=(text)=>mine.some(j=>priced.some(p=>p.title!==j.title&&new RegExp(`WO[\\s-]?${p.order_number}\\b[^\\n]{0,12}${j.title.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`,'i').test(text)));
await ask('pranav','Is there a price waiting for me?',o=>{const full=o.full;return (!o.tool||o.tool==='answer_quote')&&priced.length>0&&priced.every(j=>full.includes(amount(j.quote_amount))&&titled(full,j))&&!wrongTitle(full);});
await as('sam'); const sj=list((await api('GET','/work-orders?status=scheduled&pageSize=5')).b)[0];
await ask('sam',`Move the visit for ${sj?.title} to ${day(9)}.`,o=>o.tool==='update_work_order_dates'&&!/Due date: .*→ None/.test(o.reply));
await ask('faisal','Please withdraw my garden tap request, it is fixed.',o=>o.tool==='withdraw_request');
await ask('nabil','Approve any leave request that is waiting.',o=>!/approve|decide/.test(o.tool??''));
const ms=out.map(o=>o.ms).sort((a,b)=>a-b);
const sum={questions:out.length,ai_answered:out.filter(o=>o.ai).length,right:out.filter(o=>o.right).length,median_ms:ms[Math.floor(ms.length/2)],fastest_ms:ms[0],slowest_ms:ms.at(-1)};
console.log(JSON.stringify({summary:sum}));fs.writeFileSync('/workspace/qa/agent-check5.json',JSON.stringify({out,sum},null,1));
