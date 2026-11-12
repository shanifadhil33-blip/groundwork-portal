import { expect, it, vi, afterEach } from 'vitest';
import { operationalIntent, operationalAnswer, chaseOrder } from '../lib/agent/operational-answers';
import { assistantWeek } from '../lib/services/assistant-reads';
import { LANGUAGES } from '../lib/languages';
import { choiceWords } from '../lib/agent/choices';
import { readFileSync } from 'node:fs';
import { ids } from '../scripts/seed';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();});
it.each([
 ['Which work orders are overdue and who should I chase first? Explain briefly.','overdue'],
 ['ما أهم شيء عليّ فعله اليوم؟','attention'],
 ['Summarize this week for my team in two sentences.','week'],
 ['Which work orders are overdue and assign them to Sam',null],
 ['Summarize this week for my team and send it',null],
 ['Show overdue jobs at Marina',null],
])('recognizes the whole read request %s', (q,kind)=>expect(operationalIntent(q)).toBe(kind));
it('ranks safety priority before age, then oldest due date',()=>{
 const jobs=[{priority:'high',due_on:'2020-01-01',order_number:1},{priority:'urgent',due_on:'2025-01-01',order_number:2},{priority:'urgent',due_on:'2024-01-01',order_number:3}];
 expect(jobs.sort(chaseOrder).map(j=>j.order_number)).toEqual([3,2,1]);
});
it('ships all operational templates and native question matches without dashes',()=>{
 const prompts=['Which work orders are overdue and who should I chase first? Explain briefly.','What is the most important thing I need to do today?','Summarize this week for my team in two sentences.'];
 const keys=['This week: {new} new jobs and {done} completed jobs.','Still open: {open}, including {late} overdue.','Chase first','Assign an owner first','Highest priority first, then oldest deadline',...prompts];
 for(const {code} of LANGUAGES.filter(l=>!l.code.startsWith('en'))){
  const file=JSON.parse(readFileSync(`public/i18n/${code}.json`,'utf8'));
  for(const key of keys){expect(file[key],code+': '+key).toBeTruthy();expect(file[key]).not.toMatch(/[-–—]/);}
  for(const prompt of prompts)expect(operationalIntent(choiceWords(code)(prompt)),code).not.toBeNull();
 }
});
it('answers all three probes from local services without network calls',async()=>{
 const network=vi.fn(()=>{throw new Error('Unexpected network call');});vi.stubGlobal('fetch',network);
 for(const kind of ['overdue','attention','week'] as const){
  const reply=await operationalAnswer(ids.imran,ids.ridgeline,kind,'ar-AE');
  expect(reply).toMatch(/\p{Script=Arabic}/u);
 }
 expect(network).not.toHaveBeenCalled();
});
it('weekly counts respect client and technician visibility',async()=>{
 const {listWorkOrders}=await import('../lib/services/work-orders');
 for(const user of [ids.imran,ids.ravi,ids.pranav]){
  const visible=await listWorkOrders(user,ids.ridgeline,new URLSearchParams({active:'true'}));
  const counts=await assistantWeek(user,ids.ridgeline);
  expect(counts.open).toBe(visible.total);
  expect(counts.late).toBeLessThanOrEqual(counts.open);
 }
});
it('counts completed jobs for every role without requiring access to team audit entries',async()=>{
 const {withSystem}=await import('../lib/db');
 await withSystem(db=>db.query("UPDATE work_orders SET report_at=now() WHERE workspace_id=$1 AND status='done'",[ids.ridgeline]),ids.imran);
 const {listWorkOrders}=await import('../lib/services/work-orders');
 for(const user of [ids.imran,ids.sam,ids.ravi,ids.pranav]){
  const visible=await listWorkOrders(user,ids.ridgeline,new URLSearchParams({status:'done'}));
  expect((await assistantWeek(user,ids.ridgeline)).done).toBe(visible.total);
 }
});
it('keeps a real assistant first request below six thousand estimated input tokens',async()=>{
 const {assistant}=await import('../lib/services/assistant');const {estimateTokens,resetCooldowns}=await import('../lib/ai');
 resetCooldowns();
 for(const key of ['GEMINI_API_KEY','CLOUDFLARE_AI_TOKEN','KILO_API_KEY','OVH_AI_TOKEN','ZAI_API_KEY','NVIDIA_API_KEY','REQUESTY_API_KEY','GROQ_API_KEY','CEREBRAS_API_KEY','MISTRAL_API_KEY'])vi.stubEnv(key,'');
 vi.stubEnv('AI_KEYLESS','');vi.stubEnv('AI_USAGE_LOG','');vi.stubEnv('OPENROUTER_API_KEY','fixture');
 const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'Ready.'}}]}));vi.stubGlobal('fetch',fetcher);
 await assistant(ids.imran,ids.ridgeline,{messages:[{role:'user',content:'Explain priority and payment details for WO 12'}]});
 expect(fetcher).toHaveBeenCalledTimes(1);
 const body=JSON.parse(fetcher.mock.calls[0][1].body);
 expect(estimateTokens(body)).toBeLessThan(6000);
 expect(body.tools.length).toBeLessThan(12);
});
it('workload counts equal all visible active jobs for every caller role',async()=>{
 const {assistantWorkload}=await import('../lib/services/assistant-reads');
 const {listWorkOrders}=await import('../lib/services/work-orders');
 const {readEvidenceAnswer}=await import('../lib/agent/read-evidence-answer');
 for(const user of [ids.imran,ids.sam,ids.ravi,ids.pranav]){
  const rows=await assistantWorkload(user,ids.ridgeline);
  const visible=await listWorkOrders(user,ids.ridgeline,new URLSearchParams({active:'true'}));
  expect(rows.reduce((sum,row)=>sum+row.open,0)).toBe(visible.total);
  expect(rows.map(row=>row.open)).toEqual(rows.map(row=>row.open).sort((a,b)=>b-a));
  if(rows.length){
   const localized=readEvidenceAnswer([{structuredContent:{result:rows}}],'ar-AE');
   expect(localized).toContain(String(rows[0].open));
   expect(localized).toMatch(/\p{Script=Arabic}/u);
  }
 }
});
it('answers all workload variants without contacting an AI provider',async()=>{
 const network=vi.fn(()=>{throw new Error('Unexpected network call');});vi.stubGlobal('fetch',network);
 const {assistant}=await import('../lib/services/assistant');
 for(const content of ['Which technician has the most open jobs and why might that be?','مين عنده أكثر شغل مفتوح؟','किस तकनीशियन के पास सबसे ज्यादा काम है?','کس ٹیکنیشن پر کام کا بوجھ سب سے زیادہ ہے؟']){
  const reply=await assistant(ids.imran,ids.ridgeline,{messages:[{role:'user',content}]});
  expect(reply).toMatchObject({quick:true,localized:true});
 }
 expect(network).not.toHaveBeenCalled();
});
it('ships a localized workload scope and evidence explanation for every app language',()=>{
 const key='Visible open jobs only. The records do not explain why workloads differ.';
 for(const {code} of LANGUAGES.filter(l=>!l.code.startsWith('en'))){
  expect(choiceWords(code)(key),code).not.toBe(key);
 }
});
