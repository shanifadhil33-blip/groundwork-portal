import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DEMO_JOB_TITLES, DEMO_JOB_COMMENTS, demoJobDescription, demoJobTranslations } from '../lib/demo-job-copy';
import { DEMO_PROOF_COPY } from '../lib/demo-proof-copy';
import { DEMO_QUOTE_COPY } from '../lib/demo-quote-copy';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, readTranslationCache } from '../lib/i18n';
import { clientStatusLabels } from '../lib/ui/work-orders';

it.each(LANGUAGES.filter(({code})=>!isEnglish(code)))('$code ships every seeded job phrase and client status without English fallback',({code})=>{
 const words=readTranslationCache(readFileSync(`public/i18n/${code}.json`,'utf8'),code);
 Object.assign(words,demoJobTranslations(words));
 const demo=[...DEMO_JOB_TITLES,...Object.values(DEMO_JOB_COMMENTS),...Object.values(DEMO_QUOTE_COPY),...Array.from({length:66},(_,index)=>demoJobDescription(index+1))];
 for(const key of demo){
  expect(DEMO_PROOF_COPY.has(key),key).toBe(true);
  expect(words[key],key).toBeTruthy();
  expect(words[key],key).not.toBe(key);
 }
 for(const key of [...Object.values(clientStatusLabels),'Price changed','Waiting for the client']){
  expect(words[key],key).toBeTruthy();expect(words[key],key).not.toBe(key);
 }
});

it('allows exact fixture copy only, leaving edited notes and unseeded numbers verbatim',()=>{
 for(const value of [demoJobDescription(67),demoJobDescription(0),demoJobDescription(1)+' Please call me.',DEMO_JOB_TITLES[6]+' urgently','Pranav Menon','Al Marsa Street'])expect(DEMO_PROOF_COPY.has(value),value).toBe(false);
});
