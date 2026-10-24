import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { DEMO_JOB_TITLES, DEMO_JOB_COMMENTS, demoJobDescription, demoJobTranslations } from '../lib/demo-job-copy';
import { DEMO_PROOF_COPY } from '../lib/demo-proof-copy';
import { DEMO_QUOTE_COPY } from '../lib/demo-quote-copy';
import { DEMO_MEMORY_COPY } from '../lib/demo-memory-copy';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, readTranslationCache } from '../lib/i18n';
import { clientStatusLabels } from '../lib/ui/work-orders';
import { DUNE_HARBOUR_COPY, duneHarbourTranslations } from '../lib/demo-dune-harbour-copy';
import { dictionaries, englishSources } from '../scripts/i18n-coverage-core';
import { rightScript, validTranslation } from '../lib/i18n';

it.each(LANGUAGES.filter(({code})=>!isEnglish(code)))('$code ships every seeded job phrase and client status without English fallback',({code})=>{
 const words=readTranslationCache(readFileSync(`public/i18n/${code}.json`,'utf8'),code);
 Object.assign(words,demoJobTranslations(words));
 const demo=[...DEMO_JOB_TITLES,...Object.values(DEMO_JOB_COMMENTS),...Object.values(DEMO_QUOTE_COPY),...Object.values(DEMO_MEMORY_COPY),...Array.from({length:66},(_,index)=>demoJobDescription(index+1))];
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

it('ships Dune Harbour Arabic as demo data without adding fixture prose to interface sources',()=>{
 const files=dictionaries(),sources=englishSources(files),arabic=duneHarbourTranslations('ar-AE');
 // These labels and Ridgeline phrases already belong to the shared interface catalog.
 const shared=new Set(['Bathroom','Bedroom','Please check this repair again.','Thank you for fixing the tap.']);
 for(const copy of DUNE_HARBOUR_COPY){
  expect(validTranslation(copy,arabic[copy],'ar-AE'),copy).toBe(true);
  expect(rightScript(arabic[copy],'ar-AE'),copy).toBe(true);
  if(shared.has(copy))continue;
  expect(sources.has(copy),copy).toBe(false);
  for(const [code,words] of Object.entries(files))expect(Object.hasOwn(words,copy),`${code}: ${copy}`).toBe(false);
 }
 for(const {code} of LANGUAGES)if(code!=='ar-AE')expect(duneHarbourTranslations(code),code).toEqual({});
});
