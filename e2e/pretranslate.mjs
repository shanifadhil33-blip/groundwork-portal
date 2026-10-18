// Fills the shared ui_translations cache for every listed language ahead of time (no deploy). Paced for free AI quotas.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const strings=JSON.parse(fs.readFileSync(''+(process.env.STRINGS??'/workspace/qa/i18n/strings.json')+'','utf8'));
const LANGS=process.env.LANGS?process.env.LANGS.split(','):['ar-AE','ml','fil','hi','ur','ta','ne','bn','ps','fa-AF','fa-IR','zh-CN','sw-KE','am','ti','so','yo','ha','ig','lg','tw'];
// AI12: each call spends the shared free AI allowance the live Agent needs. Hard cap per run (MAX_CALLS, default 20); the server also stops at its daily cap.
const MAX_CALLS=Math.min(+(process.env.MAX_CALLS||20),60); let calls=0;
const s=await sandbox('ravi'); const report={};
for(const lang of LANGS){let got=0,miss=[];
 const BATCH=+(process.env.BATCH||100);for(let i=0;i<strings.length;i+=BATCH){const batch=strings.slice(i,i+BATCH);let tries=0,ok=false;
  while(!ok&&tries<2){if(calls>=MAX_CALLS){console.log('MAX_CALLS reached',calls);break;}tries++;calls++;const t=Date.now();const r=await s.api.post('/api/i18n/translate',{data:{lang,strings:batch},timeout:90000}).catch(()=>null);
   if(r?.ok()){const tr=(await r.json()).translations;const n=batch.filter(x=>tr[x]&&tr[x]!==x).length;got+=n;ok=true;const m=batch.filter(x=>!tr[x]);miss.push(...m);if(Date.now()-t>1500)await new Promise(r=>setTimeout(r,4000));}
   else await new Promise(r=>setTimeout(r,15000*tries));}
  if(!ok)miss.push(...batch);}
 report[lang]={translated:got,missing:miss.length};console.log(lang,JSON.stringify(report[lang]));
 fs.writeFileSync('/workspace/qa/i18n/pretranslate-report.json',JSON.stringify(report,null,1));}
console.log('done');
