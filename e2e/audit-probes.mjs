// Final logic audit probes on the fixed sandbox: edge cases across roles. Prints FIND lines for logic gaps. Never resets.
import fs from 'node:fs'; import { sandbox } from './sandbox.mjs';
const s=await sandbox('imran'); const ws=s.ws; const out=[];
const api=async(m,path,data)=>{const r=await s.api.fetch(`/api/workspaces/${ws}${path}`,{method:m,data,timeout:60000});let b=null;try{b=await r.json();}catch{}return {st:r.status(),b};};
const as=async p=>{const r=await s.as(p);if(r.status()!==200)throw new Error('switch '+p);};
const list=b=>Array.isArray(b)?b:b?.data??b?.rows??b?.items??b?.time_off??[];
const ua=async id=>(await api('GET',`/work-orders/${id}`)).b?.updated_at;
const note=(id,what,ok,detail)=>{ok=!!ok;{out.push({id,ok,what,detail});console.log(ok?'ok  ':'FIND',id,what,detail?JSON.stringify(detail).slice(0,260):'');}};
const notes=async(who,job)=>{await as(who);const n=list((await api('GET','/notifications?pageSize=100')).b);return n.filter(x=>x.entity_id===job).map(x=>x.kind+': '+(x.message??''));};
const day=(off)=>{const d=new Date(Date.now()+off*864e5);return d.toISOString().slice(0,10);};
await as('imran'); const members=list((await api('GET','/members')).b);
const id=n=>members.find(m=>(m.name??'').toLowerCase().startsWith(n))?.user_id;
const ravi=id('ravi'),sam=id('sam'),techs=members.filter(m=>m.role==='technician'&&m.user_id!==ravi);
const clients=list((await api('GET','/clients')).b);
const sitesOf=async cid=>list((await api('GET',`/clients/${cid}/sites`)).b);
await as('pranav'); const psites=list((await api('GET','/request-sites')).b); const pclient=psites[0]?.client_id;
await as('faisal'); const fsites=list((await api('GET','/request-sites')).b); const fclient=fsites[0]?.client_id;
await as('sam');
const mk=async(title,site,client,extra={})=>{const {status,...rest}=extra;const r=await api('POST','/work-orders',{title,site_id:site,client_id:client,...rest});if(r.st>=300){console.log('  create refused',r.st,r.b?.error?.message);return null;}if(status&&r.b?.status!==status){const p=await api('PATCH',`/work-orders/${r.b.id}`,{updated_at:r.b.updated_at,status});if(p.st>=300)console.log('  status',p.st,p.b?.error?.message);}return r.b?.id;};
const patch=async(wo,data)=>api('PATCH',`/work-orders/${wo}`,{updated_at:await ua(wo),...data});
// Find a working day for Ravi
const roff=members.find(m=>m.user_id===ravi)?.off_days??[];
let k=1; while(roff.includes(new Date(Date.now()+k*864e5).getDay()))k++; const work=day(k);

// P1 household price and visit
{ await as('faisal'); const req=await api('POST','/work-orders',{title:'Audit: household tap leak',site_id:fsites[0]?.id,description:'Tap drips',preferred_window:'Saturday after 4 PM'});
  await as('sam'); const ap=await api('POST',`/suggestions/${req.b?.id}`,{decision:'approved'}); const wo=ap.b?.work_order_id; await patch(wo,{assignee_id:ravi,scheduled_for:work,status:'scheduled'});
  const q=await api('POST',`/work-orders/${wo}/quote`,{amount:120});
  const fn=await notes('faisal',wo); note('P1a','household hears about a price on his job',fn.some(x=>x.startsWith('quote_sent')),{fn,q:q.st});
  await as('faisal'); const d=await api('POST',`/work-orders/${wo}/quote/decision`,{decision:'approved'}); note('P1b','household can answer a price on his own home',d.st===200,{st:d.st,msg:d.b?.error?.message});
  const v=await api('POST',`/work-orders/${wo}/visit`,{}); note('P1c','household can confirm the visit time at his home',v.st===200,{st:v.st,msg:v.b?.error?.message}); }

// P3 cancel mid job
await as('sam');
{ const wo=await mk('Audit: cancel mid job',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'});
  await as('ravi'); const st=await patch(wo,{status:'in_progress'}); 
  await as('sam'); const c=await patch(wo,{status:'cancelled'}); note('P3a','supervisor can cancel a job in progress',c.st===200,{st:c.st,start:st.st});
  const rn=await notes('ravi',wo); note('P3b','technician is told his job was cancelled',rn.some(x=>/cancelled/i.test(x)),{rn});
  const rp=await api('POST',`/work-orders/${wo}/report`,{updated_at:await ua(wo),outcome:'fixed'}); note('P3c','technician can not report on a cancelled job',rp.st>=400,{st:rp.st});
  const md=await api('GET','/my-day'); note('P3d','cancelled job leaves his day',!JSON.stringify(md.b).includes(wo),{});
  const pn=await notes('pranav',wo); note('P3e','client sees the cancellation',pn.some(x=>/cancelled/i.test(x)),{pn});
  await as('sam'); const rs=await api('POST',`/work-orders/${wo}/restore`,{}); const after=(await api('GET',`/work-orders/${wo}`)).b; note('P3f','a cancelled job can be restored',rs.st===200,{st:rs.st,status:after?.status,msg:rs.b?.error?.message}); }

// P4 reassign
await as('sam');
const other=id('bilal');
{ const wo=await mk('Audit: reassign',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'});
  const r=await patch(wo,{assignee_id:other}); note('P4a','supervisor reassigns to another technician',r.st===200,{st:r.st,msg:r.b?.error?.message,other:!!other});
  await as('ravi'); const g=await api('GET',`/work-orders/${wo}`); note('P4b','old technician loses the job',g.st===404,{st:g.st});
  const rn=await notes('ravi',wo); note('P4c','old technician is told the job moved',rn.length>1&&rn.some(x=>!x.startsWith('job_assigned')),{rn}); }

// P5 reschedule after the client confirmed
await as('sam');
{ const wo=await mk('Audit: reschedule',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'});
  await as('pranav'); const v=await api('POST',`/work-orders/${wo}/visit`,{});
  await as('sam'); const r=await patch(wo,{scheduled_for:day(k+1)===day(k+1)?new Date(Date.now()+(k+1)*864e5).toISOString().slice(0,10):work});
  const g=(await api('GET',`/work-orders/${wo}`)).b; note('P5a','a new time needs a new client confirmation',g?.visit_confirmed_for!==g?.scheduled_for,{v:v.st,r:r.st,conf:g?.visit_confirmed_for,sched:g?.scheduled_for});
  const pn=await notes('pranav',wo); note('P5b','client is told the visit time changed',pn.some(x=>/resched|time|visit_changed|scheduled/.test(x)),{pn});
  const rn=await notes('ravi',wo); note('P5c','technician is told the visit time changed',rn.some(x=>/resched|time|visit_changed/.test(x)),{rn}); }

// P6 off day and leave
await as('sam');
{ const offd=roff[0]; if(offd!==undefined){let j=1;while(new Date(Date.now()+j*864e5).getDay()!==offd)j++;
   const r=await mk('Audit: off day booking',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:day(j),status:'scheduled'}); note('P6a','booking a technician on his off day is refused',!r,{offd});}
  else note('P6a','Ravi has an off day to test',false,{roff});
  const tl=list((await api('GET','/time-off')).b).find(t=>t.status==='approved'&&t.user_id!==ravi);
  if(tl){const r=await mk('Audit: leave booking',psites[0].id,pclient,{assignee_id:tl.user_id,scheduled_for:tl.starts_on.slice(0,10)>day(0)?tl.starts_on.slice(0,10):day(0),status:'scheduled'}); note('P6b','booking someone on approved leave is refused',!r,{who:tl.name,on:tl.starts_on});}
}

// P7 declined price
await as('sam');
{ const wo=await mk('Audit: declined price',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'});
  await api('POST',`/work-orders/${wo}/quote`,{amount:900});
  await as('pranav'); const d=await api('POST',`/work-orders/${wo}/quote/decision`,{decision:'declined'});
  const sn=await notes('sam',wo); note('P7a','office hears the price was declined',sn.some(x=>x.includes('declined')),{sn,d:d.st});
  const rn=await notes('ravi',wo); note('P7b','technician knows the price was declined before he goes',rn.some(x=>/quote|price/i.test(x)),{rn});
  await as('ravi'); const st=await patch(wo,{status:'in_progress'}); note('P7c','work does not start on a declined price without a check',st.st!==200,{st:st.st});
  await as('sam'); const q2=await api('POST',`/work-orders/${wo}/quote`,{amount:700}); note('P7d','office can send a new price after a decline',q2.st===200,{st:q2.st}); }

// P8 money
await as('imran');
{ const o1=(await api('GET','/overview')).b; 
  await as('sam'); const wo=await mk('Audit: money',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'}); await api('POST',`/work-orders/${wo}/quote`,{amount:333});
  await as('pranav'); await api('POST',`/work-orders/${wo}/quote/decision`,{decision:'approved'});
  await as('ravi'); await patch(wo,{status:'in_progress'}); await api('POST',`/work-orders/${wo}/report`,{updated_at:await ua(wo),outcome:'fixed'});
  await as('imran'); const p=await api('POST',`/work-orders/${wo}/payment`,{payment_status:'paid'}); const o2=(await api('GET','/overview')).b;
  note('P8a','paid job adds its price to Money in',Number(o2?.money_in)-Number(o1?.money_in)===333,{p:p.st,before:o1?.money_in,after:o2?.money_in});
  note('P8b','jobs done goes up by one',Number(o2?.jobs_done)-Number(o1?.jobs_done)===1,{before:o1?.jobs_done,after:o2?.jobs_done}); }

// P9 counts
await as('sam');
{ const d=(await api('GET','/dashboard')).b?.data??(await api('GET','/dashboard')).b; const bs=d?.by_status??{};
  for(const st of ['open','scheduled','in_progress','waiting_on_parts']){const l=await api('GET',`/work-orders?status=${st}&pageSize=1`);const total=l.b?.total??l.b?.pagination?.total??l.b?.meta?.total;note('P9-'+st,'dashboard count matches the job list',total===undefined||Number(total)===Number(bs[st]??0),{dash:bs[st],list:total});} }

// P10 unassign and pause
await as('sam');
{ const wo=await mk('Audit: unassign',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'});
  const r=await patch(wo,{assignee_id:null}); const g=(await api('GET',`/work-orders/${wo}`)).b; note('P10a','removing the person leaves a sensible state',r.st!==200||g?.status!=='scheduled'||g?.assignee_id,{st:r.st,status:g?.status,assignee:g?.assignee_id});
  const r2=await patch(wo,{status:'open'}); note('P10b','a booked job can go back to open (unbook)',r2.st===200||g?.status==='open',{st:r2.st,status:g?.status});
  const w2=await mk('Audit: pause',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:work,status:'scheduled'}); await as('ravi'); await patch(w2,{status:'in_progress'});
  const p=await patch(w2,{status:'scheduled'}); note('P10c','technician can stop for today and come back (in progress to scheduled)',p.st===200,{st:p.st,msg:p.b?.error?.message}); }

// P11 client withdraws a request
await as('pranav');
{ const r=await api('POST','/work-orders',{title:'Audit: withdraw me',site_id:psites[0].id,description:'test'}); const sid=r.b?.id;
  const tries=[await api('DELETE',`/suggestions/${sid}`),await api('POST',`/suggestions/${sid}`,{decision:'declined',reason:'not needed'}),await api('PATCH',`/suggestions/${sid}`,{status:'withdrawn'})];
  note('P11','client can withdraw his own request before it is approved',tries.some(t=>t.st===200),{sts:tries.map(t=>t.st)});
  const r3=await api('POST','/work-orders',{title:'Audit: decline me',site_id:psites[0].id,description:'test'}); const sid2=r3.b?.id;
  await as('sam'); const dec=await api('POST',`/suggestions/${sid2}`,{decision:'declined',reason:'Audit cleanup'});
  const pn=list((await (async()=>{await as('pranav');return api('GET','/notifications?pageSize=100');})()).b).filter(x=>x.entity_id===sid2).map(x=>x.kind);
  note('P11b','client is told when his request is declined',pn.length>0,{pn,dec:dec.st}); }

// P12 language and misc
await as('ravi');
{ const r=await s.api.patch('/api/me/preferences',{data:{language:'xx-ZZ'}}); note('P12a','an unknown language is refused',r.status()>=400,{st:r.status()});
  const sw=await s.api.get('/sw.js'); const off=await s.api.get('/offline'); note('P12b','offline support present (service worker or offline page)',sw.status()===200||off.status()===200,{sw:sw.status(),off:off.status()}); }

await as('sam');
{
  // leave approved over existing jobs
  let j2=k+3; while(roff.includes(new Date(Date.now()+j2*864e5).getDay()))j2++; const lday=day(j2);
  const wo=await mk('Audit: job then leave',psites[0].id,pclient,{assignee_id:ravi,scheduled_for:lday,status:'scheduled'});
  await as('ravi'); const req=await api('POST','/time-off/request',{kind:'off',starts_on:lday,note:'Audit'});
  await as('sam'); const t=list((await api('GET','/time-off')).b).find(x=>x.user_id===ravi&&x.status==='pending'&&x.starts_on.slice(0,10)===lday);
  const dd=t?await api('PUT',`/time-off/${t.id}/decision`,{decision:'approved'}):{st:0};
  note('P6c','approving leave over a booked job warns or moves the job',dd.st!==200||/job|clash|booked/i.test(JSON.stringify(dd.b)),{wo:!!wo,req:req.st,dd:dd.st,b:JSON.stringify(dd.b).slice(0,160)});
}
fs.writeFileSync(process.env.OUT||'/workspace/qa/audit-probes.json',JSON.stringify(out,null,1));
console.log('FINDS',out.filter(x=>!x.ok).length,'of',out.length);
