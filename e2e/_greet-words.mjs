// LEARN01: adds the greeting words to every language file. Saved words first; the app's free AI chain only for a gap.
import { sandbox } from './sandbox.mjs'; import fs from 'node:fs';
const WORDS=['Good morning','Good afternoon','Good evening'];
const LANGS=['ar-AE','ne','hi','ur','bn','ml','ta','ps','fa-AF','fa-IR','fil','zh-CN','sw-KE','am','ti','so','yo','ha','ig','lg','tw'];
const s=await sandbox('ravi'); const out={};
for(const lang of LANGS){
 let tr=(await (await s.api.post('/api/i18n/translate',{data:{lang,strings:WORDS,cached_only:true},timeout:60000})).json()).translations??{};
 const gaps=WORDS.filter(w=>!(typeof tr[w]==='string'&&tr[w]!==w));
 if(gaps.length&&process.env.AI==='1'){const r=await s.api.post('/api/i18n/translate',{data:{lang,strings:gaps},timeout:90000});if(r.ok())tr={...tr,...((await r.json()).translations??{})};}
 out[lang]=Object.fromEntries(WORDS.map(w=>[w,typeof tr[w]==='string'&&tr[w]!==w?tr[w]:null]));
 console.log(lang,JSON.stringify(out[lang]));
}
fs.writeFileSync('/workspace/qa/i18n/greeting-words.json',JSON.stringify(out,null,1));
