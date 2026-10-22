import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { parseAssistantResponse, responseShape, withFallback, resetCooldowns, providers, assistantTurn } from '../lib/ai';
beforeEach(()=>resetCooldowns());
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();vi.unstubAllGlobals();});
it.each([
 {content:null,tool_calls:[{id:'a',name:'list_work_orders',arguments:{overdue:true}}]},
 {content:null,function_call:{name:'list_work_orders',arguments:'{"overdue":true}'}},
 {content:'{"tool_calls":[{"id":"a","name":"list_work_orders","arguments":{"overdue":true}}]}'},
 {content:[{type:'text',text:'```json\n{"tool_calls":[{"name":"list_work_orders","arguments":{"overdue":true}}]}\n```'}]},
])('normalizes compatible tool call shapes while preserving arguments',message=>{
 const out=parseAssistantResponse({choices:[{message}]},'openrouter/free');
 expect(out?.calls).toEqual([{id:expect.any(String),name:'list_work_orders',args:{overdue:true}}]);
});
it('accepts compatible text responses and rejects reasoning without an answer',()=>{
 expect(parseAssistantResponse({choices:[{text:'Ready'}]},'openrouter/free')?.text).toBe('Ready');
 expect(parseAssistantResponse({choices:[{message:{content:null,reasoning:'private'}}]},'openrouter/free')).toBeNull();
 expect(parseAssistantResponse({choices:[{message:{tool_calls:[{name:'read',arguments:'broken'}]}}]},'openrouter/free')).toBeNull();
 expect(parseAssistantResponse({choices:[{message:{tool_calls:[{name:'read',arguments:['wrong']}]}}]},'openrouter/free')).toBeNull();
});
it('reports only allowlisted types, counts and finish categories',()=>{
 const data={privateKey:'secret',choices:[{finish_reason:'secret finish',message:{content:[{type:'secret part type',text:'secret prose'}],reasoning:'secret notes',tool_calls:[{id:'secret id',name:'secret tool',arguments:'secret args'}]}}]};
 const shape=responseShape(data);
 expect(shape).toMatchObject({contentType:'array',contentParts:1,callCount:1,flatCalls:1,wrappedCalls:0,reasoningPresent:true,finish:'other'});
 expect(JSON.stringify(shape)).not.toMatch(/secret|privateKey/);
});
it('logs shape only on invalid OpenRouter 200 without spending another free request',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
 const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{finish_reason:'length',message:{content:null,reasoning:'private notes',privateField:'private text'}}]}));vi.stubGlobal('fetch',fetcher);
 const p=providers({OPENROUTER_API_KEY:'fixture'})[0];
 expect(await withFallback('assistant',()=>({messages:[]}),(_p,data)=>parseAssistantResponse(data,p.name),{},[p])).toBeNull();
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(warn).toHaveBeenCalledWith('[ai] invalid response shape',expect.objectContaining({contentType:'null',reasoningPresent:true,finish:'length'}));
 expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|fixture/);
});
it('uses the normalizer in the assistant provider path',async()=>{
 for(const key of ['GEMINI_API_KEY','CLOUDFLARE_AI_TOKEN','KILO_API_KEY','OVH_AI_TOKEN','ZAI_API_KEY','NVIDIA_API_KEY','REQUESTY_API_KEY','GROQ_API_KEY','CEREBRAS_API_KEY','MISTRAL_API_KEY'])vi.stubEnv(key,'');
 vi.stubEnv('AI_KEYLESS','');vi.stubEnv('OPENROUTER_API_KEY','fixture');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:null,tool_calls:[{name:'list_work_orders',arguments:'{"overdue":true}'}]}}]})));
 expect((await assistantTurn([{role:'user',content:'Check jobs'}],[]))?.calls[0]).toMatchObject({name:'list_work_orders',args:{overdue:true}});
});
