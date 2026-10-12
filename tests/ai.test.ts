import { afterAll,afterEach,beforeEach,expect,it,vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { draftSummaries,aiHealth,unavailable } from '../lib/ai';
import { closePools,withUser } from '../lib/db';
import { ids } from '../scripts/seed';
import * as imports from '../lib/services/imports';
import { setAuthResolverForTests } from '../lib/auth';
import * as healthRoute from '../app/api/ai-health/route';
const row={id:randomUUID(),data:{title:'Repair light'}};
const good=JSON.stringify([{row_id:row.id,summary:'Repair the lobby light.',priority:'high'}]);
const gemini=(text:string)=>Response.json({candidates:[{content:{parts:[{text}]}}]});
const groq=(text:string)=>Response.json({choices:[{message:{content:text}}]});
beforeEach(()=>{vi.stubEnv('GEMINI_API_KEY','fictional-gemini-key');vi.stubEnv('GROQ_API_KEY','fictional-groq-key');});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();setAuthResolverForTests();});
afterAll(closePools);
it('falls back from Gemini 429 to Groq success',async()=>{
 const fetch=vi.fn().mockImplementation(async(url:string)=>url.includes('googleapis')?new Response('raw quota provider secret',{status:429}):groq(good));vi.stubGlobal('fetch',fetch);
 const result=await draftSummaries([row]);expect(result).toEqual({available:true,items:[{row_id:row.id,summary:'Repair the lobby light.',priority:'high'}]});expect(fetch).toHaveBeenCalledTimes(4);expect(JSON.stringify(result)).not.toContain('secret');
});
it('tries Gemini model chain for 403, 404 and 5xx',async()=>{const fetch=vi.fn().mockResolvedValueOnce(new Response('forbidden',{status:403})).mockResolvedValueOnce(new Response('missing',{status:404})).mockResolvedValueOnce(new Response('down',{status:503})).mockResolvedValueOnce(groq(good));vi.stubGlobal('fetch',fetch);expect((await draftSummaries([row])).available).toBe(true);expect(fetch).toHaveBeenCalledTimes(4);});
it('skips providers without keys and returns plain unavailable response',async()=>{vi.stubEnv('GEMINI_API_KEY','');vi.stubEnv('GROQ_API_KEY','');const fetch=vi.fn();vi.stubGlobal('fetch',fetch);expect(await draftSummaries([row])).toEqual(unavailable);expect(await aiHealth()).toEqual({providers:[]});expect(fetch).not.toHaveBeenCalled();});
it('all providers down returns available false without raw provider text or keys',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('RAW PROVIDER SECRET',{status:500})));const result=await draftSummaries([row]);expect(result).toEqual(unavailable);expect(JSON.stringify(result)).not.toMatch(/RAW|SECRET|fictional/);});
it('network errors and malformed JSON never leak',async()=>{const fetch=vi.fn().mockRejectedValueOnce(new Error('PRIVATE exception')).mockResolvedValue(gemini('not JSON PRIVATE'));vi.stubGlobal('fetch',fetch);expect(await draftSummaries([row])).toEqual(unavailable);});
it('Zod ignores invalid items, oversized summaries, invalid priority and unrelated row ids',async()=>{
 const invalid=[{row_id:row.id,summary:'x'.repeat(141),priority:'high'},{row_id:row.id,summary:'Bad',priority:'critical'},{row_id:'invalid',summary:'Bad',priority:'high'},{row_id:randomUUID(),summary:'Unknown',priority:'high'},{row_id:row.id,summary:'Good',priority:'normal'}];vi.stubGlobal('fetch',vi.fn().mockResolvedValue(gemini(JSON.stringify(invalid))));expect(await draftSummaries([row])).toEqual({available:true,items:[{row_id:row.id,summary:'Good',priority:'normal'}]});
});
it('garbage JSON structures are ignored',async()=>{vi.stubGlobal('fetch',vi.fn().mockResolvedValue(gemini('{"garbage":"PRIVATE"}')));expect(await draftSummaries([row])).toEqual({available:true,items:[]});});
it('health is signed-in only and sanitized per-provider',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockImplementation(async(url:string)=>url.includes('googleapis')?new Response('RAW keys',{status:429}):groq('[]')));
 setAuthResolverForTests(async()=>null);expect((await healthRoute.GET(new Request('http://localhost/api/ai-health'))).status).toBe(401);
 setAuthResolverForTests(async()=>ids.pranav);const response=await healthRoute.GET(new Request('http://localhost/api/ai-health'));expect(response.status).toBe(200);const result=await response.json();expect(result.providers).toHaveLength(4);expect(result.providers[0].status).toBe('error');expect(result.providers[3].status).toBe('ok');expect(JSON.stringify(result)).not.toMatch(/RAW|fictional|keys/);
});
async function queue(count=1){const data='Title,Site\n'+Array.from({length:count},(_,i)=>`AI ${randomUUID()} ${i},Marina Exchange`).join('\n');const form=new FormData();form.set('file',new Blob([data]),'ai.csv');const imp=await imports.uploadImport(ids.imran,ids.ridgeline,new Request('http://localhost/api',{method:'POST',body:form}));await imports.mapImport(ids.imran,ids.ridgeline,imp.id,{mapping:imp.mapping});await imports.queueImport(ids.imran,ids.ridgeline,imp.id);return imp;}
it('all providers down leaves queue and approval working',async()=>{const imp=await queue();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('PRIVATE',{status:503})));expect(await imports.importDrafts(ids.sam,ids.ridgeline,imp.id)).toEqual(unavailable);const pending=await imports.importRows(ids.sam,ids.ridgeline,imp.id,new URLSearchParams());const order=await imports.approveRow(ids.sam,ids.ridgeline,pending.data[0].id,{});expect(order.source).toBe('import');});
it('drafts batch at most 25 rows, stores suggestions and next call handles remaining rows',async()=>{
 const imp=await queue(27);const fetch=vi.fn().mockImplementation(async(_url:string,options:RequestInit)=>{const body=JSON.parse(options.body as string);const prompt=body.contents[0].parts[0].text;const rows=JSON.parse(prompt.slice(prompt.indexOf('[{"id"')));expect(rows.length).toBeLessThanOrEqual(25);return gemini(JSON.stringify(rows.map((r:{id:string})=>({row_id:r.id,summary:'Suggested summary',priority:'high'}))));});vi.stubGlobal('fetch',fetch);
 expect(await imports.importDrafts(ids.sam,ids.ridgeline,imp.id)).toEqual({available:true,stored:25,suggestion:true});expect(await imports.importDrafts(ids.sam,ids.ridgeline,imp.id)).toEqual({available:true,stored:2,suggestion:true});
 const pending=await imports.listQueue(ids.sam,ids.ridgeline,new URLSearchParams());expect(pending.data.filter(r=>r.import_id===imp.id).every(r=>r.ai_summary==='Suggested summary'&&r.ai_is_suggestion&&r.data.priority==='normal')).toBe(true);
 const first=(await imports.importRows(ids.sam,ids.ridgeline,imp.id,new URLSearchParams())).data[0];expect((await imports.approveRow(ids.sam,ids.ridgeline,first.id,{})).priority).toBe('normal');
 const audits=await withUser(ids.imran,db=>db.query("SELECT id FROM audit_log WHERE entity='import_rows' AND entity_id=$1 AND \"after\"->>'ai_summary'='Suggested summary'",[first.id]));expect(audits.rowCount).toBeGreaterThan(0);
});
it('invalid AI items do not modify queue rows',async()=>{const imp=await queue();vi.stubGlobal('fetch',vi.fn().mockResolvedValue(gemini('[{"row_id":"bad","summary":"PRIVATE","priority":"impossible"}]')));expect(await imports.importDrafts(ids.imran,ids.ridgeline,imp.id)).toEqual({available:true,stored:0,suggestion:true});expect((await imports.importRows(ids.imran,ids.ridgeline,imp.id,new URLSearchParams())).data[0].ai_summary).toBeNull();});
it('AI finishing after approval does not write suggestions onto decided rows',async()=>{const imp=await queue();const row=(await imports.importRows(ids.imran,ids.ridgeline,imp.id,new URLSearchParams())).data[0];vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>{await imports.approveRow(ids.sam,ids.ridgeline,row.id,{});return gemini(JSON.stringify([{row_id:row.id,summary:'Late draft',priority:'urgent'}]));}));expect(await imports.importDrafts(ids.imran,ids.ridgeline,imp.id)).toEqual({available:true,stored:0,suggestion:true});const decided=(await imports.importRows(ids.imran,ids.ridgeline,imp.id,new URLSearchParams())).data[0];expect(decided.decision).toBe('approved');expect(decided.ai_summary).toBeNull();});
