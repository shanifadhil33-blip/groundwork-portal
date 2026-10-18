// End to end flow walk on the fixed sandbox, every role, with 390 screenshots. Records gaps; never resets.
import { chromium } from '@playwright/test'; import fs from 'node:fs'; import { sandbox, B } from './sandbox.mjs';
const OUT='/workspace/qa/walk-oct18'; const s=await sandbox('imran'); const ws=s.ws; const log=[]; const gaps=[];
const api=async(m,path,data)=>{const r=await s.api.fetch(`/api/workspaces/${ws}${path}`,{method:m,data,timeout:60000});let b=null;try{b=await r.json();}catch{}return {st:r.status(),b};};
const as=async p=>{const r=await s.as(p);if(r.status()!==200)throw new Error('switch '+p+' '+r.status());};
const step=(name,ok,detail)=>{log.push({name,ok,detail});if(!ok)gaps.push({name,detail});console.log(ok?'ok  ':'GAP ',name,detail?JSON.stringify(detail).slice(0,220):'');};
const list=b=>Array.isArray(b)?b:b?.data??b?.rows??b?.items??b?.time_off??[];
const ua=async id=>(await api('GET',`/work-orders/${id}`)).b?.updated_at;
const br=await chromium.launch(); const shot=async(who,path,name)=>{const ctx=await br.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});await ctx.addCookies((await s.api.storageState()).cookies);const p=await ctx.newPage();try{await p.goto(B+path,{waitUntil:'load',timeout:45000});await p.waitForTimeout(2500);await p.screenshot({path:`${OUT}/${name}.png`});const t=await p.evaluate(()=>document.body.innerText);await ctx.close();return t;}catch(e){await ctx.close();return 'ERR '+e.message;}};
const today=new Date().toISOString().slice(0,10);
// people
await as('imran'); const members=list((await api('GET','/members')).b); const id=n=>members.find(m=>(m.name??'').toLowerCase().startsWith(n))?.user_id;
const ravi=id('ravi'), sam=id('sam'); step('members listed', !!ravi&&!!sam, {count:members.length});
// A client request
await as('pranav'); const sites=list((await api('GET','/request-sites')).b); step('facility manager sees his sites', sites.length>0, {n:sites.length});
const req=await api('POST','/work-orders',{title:'Walk: AC dripping in meeting room',description:'Water on the floor under the AC unit.',site_id:sites[0]?.id,priority:'high'});
step('facility manager raises a request', req.st===201, {st:req.st,status:req.b?.status,err:req.b?.error});
const sugId=req.b?.id; await shot('pranav','/work-orders','A1-pranav-requests');
await as('nabil'); const nsug=list((await api('GET','/suggestions?pageSize=50')).b); step('office staff sees the new request', nsug.some(x=>x.id===sugId), {n:nsug.length});
const napp=await api('POST',`/suggestions/${sugId}`,{decision:'approved'}); step('office staff can not approve a request into a job (supervisor does)', napp.st===403, {st:napp.st});
await as('sam'); const sapp=await api('POST',`/suggestions/${sugId}`,{decision:'approved'}); step('supervisor approves the request into a job', [200,201].includes(sapp.st), {st:sapp.st,err:sapp.b?.error});
const wo=sapp.b?.work_order_id??sapp.b?.job_id??sapp.b?.work_order?.id??sapp.b?.id; step('approval returns the job id', !!wo, {keys:Object.keys(sapp.b??{})});
await shot('sam','/suggestions','A2-sam-suggestions');
// B office and supervisor see and assign
await as('nabil'); const nq=list((await api('GET','/work-orders?status=open&pageSize=50')).b); step('office staff sees the new job', nq.some(w=>w.id===wo));
await as('sam'); const det=await api('GET',`/work-orders/${wo}`); step('supervisor opens it', det.st===200, {st:det.st});
const asg=await api('PATCH',`/work-orders/${wo}`,{updated_at:await ua(wo),assignee_id:ravi,scheduled_for:today,status:'scheduled'}); step('supervisor assigns Ravi for today', asg.st===200, {st:asg.st,err:asg.b?.error,status:asg.b?.status});
await shot('sam',`/work-orders/${wo}`,'B1-sam-job-assigned');
// C quote
const q=await api('POST',`/work-orders/${wo}/quote`,{amount:250,note:'Drain line clean and test'}); step('supervisor sends a price', [200,201].includes(q.st), {st:q.st,err:q.b?.error});
await as('pranav'); const pn=list((await api('GET','/notifications?pageSize=50')).b); step('facility manager is told about the price', pn.some(n=>JSON.stringify(n).match(/price|quote|250/i)), {latest:pn.slice(0,2)});
await shot('pranav',`/work-orders/${wo}`,'C1-pranav-price');
const qd=await api('POST',`/work-orders/${wo}/quote/decision`,{decision:'approved'}); step('facility manager approves the price', [200,201].includes(qd.st), {st:qd.st,err:qd.b?.error});
// D technician does the job
await as('ravi'); const md=await api('GET','/my-day'); step('Ravi sees it on Today', JSON.stringify(md.b).includes(wo), {st:md.st});
await shot('ravi','/today','D1-ravi-today');
await as('pranav'); const pc=await api('POST',`/work-orders/${wo}/precheck`,{answers:{},note:'Room free after 2 pm'}); step('client answers the visit check', [200,201].includes(pc.st), {st:pc.st,err:pc.b?.error}); await as('ravi');
const st1=await api('PATCH',`/work-orders/${wo}`,{updated_at:await ua(wo),status:'in_progress'}); step('Ravi starts the job', st1.st===200, {st:st1.st,err:st1.b?.error});
const assignTry=await api('PATCH',`/work-orders/${wo}`,{updated_at:await ua(wo),assignee_id:sam}); step('Ravi cannot reassign', assignTry.st>=400, {st:assignTry.st});
const cur=(await api('GET',`/work-orders/${wo}`)).b; const rp=await api('POST',`/work-orders/${wo}/report`,{updated_at:await ua(wo),problem:'Drain line blocked',work:'Cleared the drain line and tested',outcome:'fixed'}); step('Ravi saves the job report', [200,201].includes(rp.st), {st:rp.st,err:rp.b?.error,status:rp.b?.status});
let after=(await api('GET',`/work-orders/${wo}`)).b; if(after?.status!=='done'){const dn=await api('PATCH',`/work-orders/${wo}`,{updated_at:await ua(wo),status:'done'});step('Ravi marks done', dn.st===200,{st:dn.st,err:dn.b?.error});after=(await api('GET',`/work-orders/${wo}`)).b;}
step('job is done after report', after?.status==='done', {status:after?.status});
// E client sees done, rates
await as('pranav'); const pd=(await api('GET',`/work-orders/${wo}`)).b; step('facility manager sees done', pd?.status==='done', {status:pd?.status});
step('facility manager sees the report words', JSON.stringify(pd).includes('Cleared the drain line'), {});
const rt=await api('POST',`/work-orders/${wo}/rating`,{stars:5,note:'Quick and tidy'}); step('facility manager rates 5 stars', [200,201].includes(rt.st), {st:rt.st,err:rt.b?.error});
await shot('pranav',`/work-orders/${wo}`,'E1-pranav-done-rated');
const rt2=await api('POST',`/work-orders/${wo}/rating`,{stars:1}); step('rating can not be given twice (or updates)', rt2.st!==500, {st:rt2.st});
// F other client roles
await as('kevin'); const kv=await api('GET',`/work-orders/${wo}`); step('client staff (same client) can view the request', kv.st===200, {st:kv.st});
const kr=await api('POST',`/work-orders/${wo}/rating`,{stars:3}); step('a job takes one rating only', kr.st===409, {st:kr.st});
await as('faisal'); const fv=await api('GET',`/work-orders/${wo}`); step('household can not see another client job', fv.st===404||fv.st===403, {st:fv.st});
await as('omar'); const ov=await api('GET',`/work-orders/${wo}`); step('omar (other client) can not see it', ov.st===404||ov.st===403, {st:ov.st});
// internal note privacy
await as('sam'); const ic=await api('POST',`/work-orders/${wo}/comments`,{body:'Internal: client is slow to pay',visibility:'internal'}); step('supervisor adds an internal note', [200,201].includes(ic.st), {st:ic.st,err:ic.b?.error});
await as('pranav'); const pcm=await api('GET',`/work-orders/${wo}`); step('client never sees internal notes', pcm.st===200&&!JSON.stringify(pcm.b).includes('slow to pay'), {st:pcm.st,comments:(pcm.b?.comments??[]).length}); await as('kevin'); const kcm=await api('GET',`/work-orders/${wo}`); step('client staff never sees internal notes', kcm.st===200&&!JSON.stringify(kcm.b).includes('slow to pay'), {st:kcm.st}); await as('sam'); const scm=await api('GET',`/work-orders/${wo}`); step('supervisor sees the internal note', JSON.stringify(scm.b).includes('slow to pay'));
// G suggestion
await as('ravi'); const sg=await api('POST','/suggestions',{title:'Walk: lobby light flickering',problem:'Second light from the door flickers',site_id:sites[0]?.id}); step('Ravi suggests a job', [200,201].includes(sg.st), {st:sg.st,err:sg.b?.error});
await as('sam'); const sd=await api('POST',`/suggestions/${sg.b?.id}`,{decision:'approved'}); step('supervisor approves the suggestion into a job', [200,201].includes(sd.st), {st:sd.st,err:sd.b?.error,wo:sd.b?.work_order_id??sd.b?.work_order?.id});
// H time off
await as('ravi'); const tomorrow=new Date(Date.now()+86400000*3).toISOString().slice(0,10);
const to=await api('POST','/time-off/request',{kind:'off',starts_on:tomorrow,note:'Family'}); step('Ravi asks for a day off', [200,201].includes(to.st), {st:to.st,err:to.b?.error});
await as('sam'); const tl=list((await api('GET','/time-off')).b); const mine=tl.find(t=>String(t.starts_on).slice(0,10)===tomorrow&&t.status==='pending')??tl.find(t=>t.status==='pending'); if(!mine)console.log('time off sample',JSON.stringify(tl.slice(0,2))); 
const tdd=mine?await api('PUT',`/time-off/${mine.id}/decision`,{decision:'approved'}):{st:0}; step('supervisor approves the day off', [200,201].includes(tdd.st), {st:tdd.st,found:!!mine,err:tdd.b?.error});
await shot('sam','/schedule','H1-sam-schedule');
// I messages
await as('pranav'); const msg=await api('POST','/messages',{work_order_id:wo,body:'Thanks, all good now.'}); step('facility manager sends a message on the job', [200,201].includes(msg.st), {st:msg.st,err:msg.b?.error});
await as('sam'); const un=await api('GET','/messages/unread'); step('supervisor sees an unread message', JSON.stringify(un.b).match(/[1-9]/)!==null, {b:un.b});
await shot('sam','/messages','I1-sam-messages');
// J admin and owner
await as('imran'); const ov2=await api('GET','/overview'); step('owner overview opens', ov2.st===200, {st:ov2.st});
await shot('imran','/overview','J1-imran-overview'); await shot('imran','/dashboard','J2-imran-dashboard'); await shot('imran','/team','J3-imran-team');
const inv=await api('GET','/invites'); step('admin can list invites', inv.st===200, {st:inv.st});
await as('ravi'); const rinv=await api('GET','/invites'); step('technician can not see invites', rinv.st>=400, {st:rinv.st});
await as('nabil'); const nset=await api('PATCH','/settings',{approval_mode:'every'}); step('office staff can not change company settings', nset.st>=400, {st:nset.st});
await shot('nabil','/dashboard','J4-nabil-dashboard'); await shot('kevin','/home','F1-kevin-home'); await shot('faisal','/home','F2-faisal-home'); await shot('omar','/home','F3-omar-home');
await br.close();
fs.writeFileSync(`${OUT}/walk.json`,JSON.stringify({log,gaps},null,1)); console.log('GAPS',gaps.length); process.exit(0);
