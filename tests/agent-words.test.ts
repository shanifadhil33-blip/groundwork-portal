import { afterAll, afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
vi.mock('../lib/ai',async original=>({...await original<typeof import('../lib/ai')>(),assistantTurn:vi.fn()}));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { listWords,saveWord,deleteWord,resolveWords,type AgentWord } from '../lib/services/agent-words';
import { callTool } from '../lib/agent/tools';
import { inWorkspace } from '../lib/services/shared';
import { withSystem,closePools } from '../lib/db';
import { ids,siteId } from '../lib/fixture';
const ws=ids.ridgeline;
let baseline:string[]=[];
beforeEach(async()=>{
 vi.mocked(assistantTurn).mockReset();
 vi.mocked(assistantTurn).mockResolvedValue({text:'Here are your words.',calls:[]} as any);
 baseline=await withSystem(async db=>(await db.query('SELECT id FROM agent_words')).rows.map(r=>r.id));
});
afterEach(()=>withSystem(async db=>{await db.query('DELETE FROM agent_words WHERE NOT(id=ANY($1::uuid[]))',[baseline]);}));
afterAll(closePools);
const company={phrase:'office tower',means_kind:'site',means_id:siteId(1),scope:'company'};
const personal={phrase:'my place',means_kind:'site',means_id:siteId(3),scope:'personal'};
it('admin saves company words, team reads them, and clients cannot read them through the service or SQL',async()=>{
 const word=await saveWord(ids.imran,ws,company);
 expect(word).toMatchObject({means_text:'Marina Exchange',user_id:null,created_by:ids.imran});
 for(const actor of [ids.imran,ids.sam,ids.ravi])expect((await listWords(actor,ws)).company.map(w=>w.id)).toContain(word.id);
 for(const actor of [ids.pranav,ids.faisal]){
  expect((await listWords(actor,ws)).company).toEqual([]);
  expect(await inWorkspace(actor,ws,async c=>(await c.db.query('SELECT * FROM agent_words WHERE id=$1',[word.id])).rows)).toEqual([]);
 }
 for(const actor of [ids.sam,ids.ravi])await expect(saveWord(actor,ws,company)).rejects.toMatchObject({status:403,message:'Only an admin can add company words.'});
});
it('personal words are private, including client words, and removal respects ownership',async()=>{
 const word=await saveWord(ids.ravi,ws,personal);
 expect((await listWords(ids.ravi,ws)).personal.map(w=>w.id)).toContain(word.id);
 expect((await listWords(ids.sam,ws)).personal.map(w=>w.id)).not.toContain(word.id);
 expect(await inWorkspace(ids.sam,ws,async c=>(await c.db.query('SELECT * FROM agent_words WHERE id=$1',[word.id])).rows)).toEqual([]);
 await expect(deleteWord(ids.sam,ws,word.id)).rejects.toMatchObject({status:404});
 await deleteWord(ids.ravi,ws,word.id);
 const client=await saveWord(ids.faisal,ws,{phrase:'my heater',means_kind:'other',means_text:'Water heater',scope:'personal'});
 expect((await listWords(ids.faisal,ws)).personal.map(w=>w.id)).toContain(client.id);
 expect((await listWords(ids.imran,ws)).personal.map(w=>w.id)).not.toContain(client.id);
});
it('RLS also refuses company writes and personal forgery directly',async()=>{
 for(const actor of [ids.sam,ids.ravi,ids.pranav,ids.faisal])await expect(inWorkspace(actor,ws,c=>c.db.query("INSERT INTO agent_words(workspace_id,phrase,means_kind,means_text,created_by) VALUES($1,'forbidden','other','Place',$2)",[ws,actor]))).rejects.toMatchObject({code:'42501'});
 await expect(inWorkspace(ids.sam,ws,c=>c.db.query("INSERT INTO agent_words(workspace_id,user_id,phrase,means_kind,means_text,created_by) VALUES($1,$2,'forged','other','Place',$3)",[ws,ids.ravi,ids.sam]))).rejects.toMatchObject({code:'42501'});
 const word=await saveWord(ids.imran,ws,company);
 for(const actor of [ids.sam,ids.ravi,ids.faisal]){
  expect(await inWorkspace(actor,ws,async c=>(await c.db.query("UPDATE agent_words SET means_text='Changed' WHERE id=$1",[word.id])).rowCount)).toBe(0);
  expect(await inWorkspace(actor,ws,async c=>(await c.db.query('DELETE FROM agent_words WHERE id=$1',[word.id])).rowCount)).toBe(0);
 }
 await deleteWord(ids.imran,ws,word.id);
});
it('trims phrases, rejects duplicates within scope, and refuses hidden or foreign targets',async()=>{
 await saveWord(ids.imran,ws,{...company,phrase:'  Office Tower  '});
 await expect(saveWord(ids.imran,ws,company)).rejects.toMatchObject({status:409,message:'You already use that word.'});
 await expect(saveWord(ids.ravi,ws,{...personal,means_id:siteId(7)})).rejects.toMatchObject({status:404});
 await expect(saveWord(ids.faisal,ws,{...personal,means_id:siteId(1)})).rejects.toMatchObject({status:404});
 await expect(saveWord(ids.ravi,ws,{...personal,means_id:undefined})).rejects.toMatchObject({status:422});
 await expect(saveWord(ids.ravi,ws,{...personal,phrase:''})).rejects.toThrow();
 await expect(saveWord(ids.ravi,ws,{...personal,phrase:'x'.repeat(61)})).rejects.toThrow();
 await saveWord(ids.ravi,ws,{...personal,phrase:'office tower'});
 const asset=await inWorkspace(ids.imran,ws,async c=>(await c.db.query("SELECT id FROM assets WHERE workspace_id=$1 AND name='Roof AC 1'",[ws])).rows[0]);
 expect(await saveWord(ids.imran,ws,{phrase:'cooling unit',means_kind:'asset',means_id:asset.id,means_text:'Wrong name',scope:'personal'})).toMatchObject({means_text:'Roof AC 1'});
});
it.each(['company','personal'] as const)('enforces the %s limit, including simultaneous saves at the boundary',async scope=>{
 const actor=scope==='company'?ids.imran:ids.ravi,owner=scope==='company'?null:actor,limit=scope==='company'?200:100;
 const count=(await listWords(actor,ws))[scope].length;
 await withSystem(db=>db.query("INSERT INTO agent_words(workspace_id,user_id,phrase,means_kind,means_text,created_by) SELECT $1,$2,'limit word '||n,'other','Place',$3 FROM generate_series(1,$4::int) n",[ws,owner,actor,limit-count-1]));
 const results=await Promise.allSettled(['last word one','last word two'].map(phrase=>saveWord(actor,ws,{phrase,scope,means_kind:'other',means_text:'Place'})));
 expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
 expect(results.find(r=>r.status==='rejected')).toMatchObject({reason:{status:422}});
 expect((await listWords(actor,ws))[scope]).toHaveLength(limit);
});
const word=(phrase:string,means_text:string):AgentWord=>({id:'',phrase,means_text,means_kind:'other',means_id:null,user_id:null});
it('resolves longest phrases once, case insensitively, with personal precedence and Unicode boundaries',()=>{
 const words={company:[word('tower','Company'),word('the tower','Marina Exchange'),word('البرج','Marina Exchange'),word('a+b','Unit')],personal:[word('TOWER','Personal')]};
 expect(resolveWords('THE TOWER and Tower, towers; البرج والبرج a+b',words)).toBe('THE TOWER (Marina Exchange) and Tower (Personal), towers; البرج (Marina Exchange) والبرج a+b (Unit)');
 expect(resolveWords('tower', {company:[word('tower','big tower')],personal:[]})).toBe('tower (big tower)');
});
it('answers late jobs at the company alias without AI and only returns that site',async()=>{
 const result:any=await assistant(ids.imran,ws,{messages:[{role:'user',content:'anything late at the tower?'}]});
 expect(result.quick).toBe(true);
 expect(result.reply).toContain('Marina Exchange');
 expect(result.reply).not.toMatch(/Pine Terrace|Harbor Annex|Northgate/);
 expect(assistantTurn).not.toHaveBeenCalled();
});
it('quick answers resolve asset words and waiting for parts questions before matching names',async()=>{
 const asset:any=await assistant(ids.imran,ws,{messages:[{role:'user',content:'late jobs at big chiller?'}]});
 expect(asset.quick).toBe(true);expect(asset.reply).toBe('Nothing is late. Every job is on time.');
 const parts:any=await assistant(ids.imran,ws,{messages:[{role:'user',content:'Which jobs are waiting for parts at the tower?'}]});
 expect(parts.quick).toBe(true);expect(parts.reply).not.toMatch(/Pine Terrace|Harbor Annex|Northgate/);
 expect(assistantTurn).not.toHaveBeenCalled();
});
it('includes words in AI context and expands the person words without exposing company words to clients',async()=>{
 await saveWord(ids.ravi,ws,{...personal,phrase:'the tower'});
 await assistant(ids.ravi,ws,{messages:[{role:'user',content:'Tell me more about the annex please'}]});
 const [history,,context]=vi.mocked(assistantTurn).mock.calls[0];
 expect(history).toContainEqual({role:'user',content:'Tell me more about the annex (Harbor Annex) please'});
 expect(context).toContain('Words this person and company use:');expect(context).toContain('the tower means Harbor Annex');expect(context).not.toContain('the tower means Marina Exchange');
 vi.mocked(assistantTurn).mockClear();
 await assistant(ids.pranav,ws,{messages:[{role:'user',content:'Explain how my requests work'}]});
 expect(vi.mocked(assistantTurn).mock.calls[0][2]).not.toContain('the tower means Marina Exchange');
});
it('Ravi can remember and forget his words through approved tools and company scope is refused',async()=>{
 const c={user:ids.ravi,ws,kind:'assistant' as const,scope:'write' as const};
 expect(await callTool(c,'remember_word',personal)).toMatchObject({isError:true,structuredContent:{error:{code:'confirmation_required'}}});
 const result=await callTool({...c,approved:true},'remember_word',personal);
 expect(result.isError).toBeUndefined();
 const saved=(result.structuredContent as any).result;
 expect(await callTool({...c,approved:true},'remember_word',company)).toMatchObject({isError:true,structuredContent:{error:{message:'Only an admin can add company words.'}}});
 expect(await callTool({...c,scope:'read'},'my_words',{})).toMatchObject({structuredContent:{result:{personal:expect.arrayContaining([expect.objectContaining({id:saved.id})])}}});
 expect(await callTool({...c,approved:true},'forget_word',{id:saved.id})).toMatchObject({structuredContent:{result:{deleted:true}}});
});
it('assistant shows Yes and Change before saving a technician word',async()=>{
 vi.mocked(assistantTurn).mockResolvedValueOnce({text:'',calls:[{id:'word',name:'remember_word',args:personal}]} as any);
 const answer:any=await assistant(ids.ravi,ws,{messages:[{role:'user',content:'When I say my place I mean Harbor Annex'}]});
 expect(answer.pending_action?.tool).toBe('remember_word');
 expect(answer.pending_action.summary).toContain('my place means Harbor Annex');
 expect((await listWords(ids.ravi,ws)).personal.some(w=>w.phrase==='my place')).toBe(false);
 await assistant(ids.ravi,ws,{messages:[],confirm_action_id:answer.pending_action.id});
 expect((await listWords(ids.ravi,ws)).personal.some(w=>w.phrase==='my place')).toBe(true);
});
it('rollback drops the table and can be rolled back for the remaining tests',async()=>{
 await withSystem(async db=>{
  await db.query('SAVEPOINT words_rollback');
  await db.query(readFileSync('db/rollbacks/rollback-0060_agent_words.sql','utf8'));
  expect((await db.query("SELECT to_regclass('public.agent_words') AS name")).rows[0].name).toBeNull();
  await db.query('ROLLBACK TO SAVEPOINT words_rollback');
 });
});
