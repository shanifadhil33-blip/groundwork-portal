// LANG01: writes the saved interface translations into language files (public/i18n/<code>.json), one per language.
// Reads only saved words (cached_only, never an AI call) through the one fixed demo sandbox. Sources: the harvested
// interface strings (no job data, no dates). Rerun after each translation pass, then review the diff.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const files=(process.env.STRINGS??'/workspace/qa/i18n/strings-ui.json,/workspace/qa/i18n/strings-gaps.json').split(',');
// Interface text only: job data, demo names, places, amounts and codes stay in the saved cache, not in language files.
const DATA=/Imran|Ravi|Pranav|\bSam\b|Omar|Nabil|Kevin|Faisal|Bilal|Anil|Laith|Karim|Arif|Yousef|Rashid|Harbor|Northgate|Larkspur|Marina|Warehouse|Pine|Juniper|COBALT|AED|Dubai|Sharjah|Abu Dhabi|Al [A-Z]|Asia\/|\bWO \d|\d/;
const strings=[...new Set(files.flatMap(f=>JSON.parse(fs.readFileSync(f,'utf8'))))].filter(s=>!DATA.test(s)).sort();
const LANGS=['ar-AE','ne','hi','ur','bn','ml','ta','ps','fa-AF','fa-IR','fil','zh-CN','sw-KE','am','ti','so','yo','ha','ig','lg','tw'];
const OUT=new URL('../public/i18n/',import.meta.url); fs.mkdirSync(OUT,{recursive:true});
const s=await sandbox('ravi'); const report={};
for(const lang of LANGS){const words={};
 for(let i=0;i<strings.length;i+=200){const batch=strings.slice(i,i+200);
  const r=await s.api.post('/api/i18n/translate',{data:{lang,strings:batch,cached_only:true},timeout:60000});
  if(!r.ok())throw new Error(lang+' '+r.status());const tr=(await r.json()).translations;
  for(const k of batch)if(typeof tr[k]==='string'&&tr[k].trim()&&tr[k]!==k)words[k]=tr[k];}
 // Words already in the file win: hand fixes and words added by hand (greetings, script refills) are never dropped by a new export.
 let existing={};try{existing=JSON.parse(fs.readFileSync(new URL(lang+'.json',OUT),'utf8'));}catch{}
 Object.assign(words,existing);
 const sorted=Object.fromEntries(Object.keys(words).sort().map(k=>[k,words[k]]));
 fs.writeFileSync(new URL(lang+'.json',OUT),JSON.stringify(sorted,null,0).replace(/","/g,'",\n"')+'\n');
 report[lang]={words:Object.keys(words).length,of:strings.length};console.log(lang,JSON.stringify(report[lang]));}
fs.writeFileSync('/workspace/qa/i18n/language-files-report.json',JSON.stringify(report,null,1));console.log('done');
