import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assistantTurn, compactAssistantHistory, compactSnapshot, contextWindow, estimateTokens, fitRequest, providers, resetCooldowns, withFallback } from '../lib/ai';
const p=(name:string)=>({name:`${name}/first`,kind:'openai' as const,model:'first',url:`https://${name}.invalid`,headers:{}});
beforeEach(()=>{resetCooldowns();vi.stubEnv('AI_USAGE_LOG','');vi.stubEnv('AI_SPREAD','');});
afterEach(()=>{vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();vi.unstubAllEnvs();});
const answer=(content:any)=>Response.json({choices:[{message:{content}}]});
it('starts two healthy providers together and cancels the slow loser immediately',async()=>{
 let losingSignal:AbortSignal|undefined;
 const fetcher=vi.fn().mockImplementation((url,options)=>{
  if(url.includes('gemini')){losingSignal=options.signal;return new Promise(()=>{});}
  expect(losingSignal).toBeDefined();return Promise.resolve(answer('Ready'));
 });
 vi.stubGlobal('fetch',fetcher);
 expect(await withFallback('assistant',()=>({messages:[]}),(_p,data)=>data.choices[0].message.content,{},[p('gemini'),p('openrouter')])).toBe('Ready');
 expect(fetcher).toHaveBeenCalledTimes(2);expect(losingSignal?.aborted).toBe(true);
});
it('races healthy providers past models on cooldown',async()=>{
 const a=p('gemini'),b=p('openrouter'),c=p('groq');
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('limit',{status:429})));
 await withFallback('assistant',()=>({}),()=>null,{},[a]);
 const fetcher=vi.fn().mockResolvedValue(answer('OK'));vi.stubGlobal('fetch',fetcher);
 expect(await withFallback('assistant',()=>({}),()=>true,{},[a,b,c])).toBe(true);
 expect(fetcher.mock.calls.map(call=>call[0])).toEqual([b.url,c.url]);
});
it('caps all timeouts to the remaining deadline including an unresponsive response body',async()=>{
 vi.useFakeTimers();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,status:200,json:()=>new Promise(()=>{})}));
 const result=withFallback('assistant',()=>({}),()=>null,{deadline:1200},[p('gemini'),p('openrouter'),p('groq')]);
 await vi.advanceTimersByTimeAsync(1200);
 expect(await result).toBeNull();expect(fetch).toHaveBeenCalledTimes(2);
});
it('uses the next configured model once on an upstream 400 and never loops over all models',async()=>{
 const first=p('kilo'),second={...first,name:'kilo/second',model:'second'},third={...first,name:'kilo/third',model:'third'};
 const fetcher=vi.fn().mockImplementation(async()=>new Response('upstream provider was unable to process the request',{status:400}));vi.stubGlobal('fetch',fetcher);
 expect(await withFallback('assistant',p=>({model:p.model}),()=>null,{},[first,second,third])).toBeNull();
 expect(fetcher.mock.calls.map(call=>JSON.parse(call[1].body).model)).toEqual(['first','second']);
});
it('does not retry a quota error on another model of the same provider',async()=>{
 const first=p('requesty'),second={...first,name:'requesty/second'};
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('quota',{status:429})));
 await withFallback('assistant',()=>({}),()=>null,{},[first,second]);expect(fetch).toHaveBeenCalledTimes(1);
});
it('allows one retry for a transient error with only one configured model',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(answer('OK')));
 expect(await withFallback('assistant',()=>({}),(_p,data)=>data.choices[0].message.content,{},[p('groq')])).toBe('OK');expect(fetch).toHaveBeenCalledTimes(2);
});
it('counts tool schemas in the context budget, reduces output, and skips a provider that cannot fit',async()=>{
 const cloud=p('cloudflare');
 const body={messages:[{role:'user',content:'x'.repeat(78000)}],max_tokens:2000};
 const fitted=fitRequest(cloud,body);
 expect(fitted.max_tokens).toBeLessThan(2000);expect(fitted.max_tokens).toBeGreaterThanOrEqual(256);
 const output=fitted.max_tokens;delete fitted.max_tokens;
 expect(estimateTokens(fitted)+output+512).toBeLessThanOrEqual(contextWindow(cloud));expect(body.max_tokens).toBe(2000);
 const fetcher=vi.fn().mockResolvedValue(answer('OK'));vi.stubGlobal('fetch',fetcher);
 expect(await withFallback('assistant',()=>({tools:[{description:'x'.repeat(100000)}]}),()=>true,{},[cloud])).toBeNull();expect(fetcher).not.toHaveBeenCalled();
});
it('caps snapshots, keeps counts and IDs, and removes duplicate MCP record text',()=>{
 const rows=Array.from({length:100},(_,i)=>({id:String(i),title:'Job '+i}));
 const snapshot=compactSnapshot({content:[{text:JSON.stringify(rows)}],structuredContent:{result:{count:100,data:rows}}});
 expect(snapshot).not.toHaveProperty('content');expect(snapshot.result.count).toBe(100);expect(snapshot.result.data).toMatchObject({truncated:true,total:100});expect(snapshot.result.data.items).toHaveLength(6);
 expect(compactSnapshot({id:'001',date:'2026-10-22'})).toEqual({id:'001',date:'2026-10-22'});
});
it('trims old history only at user boundaries and retains tool call pairs',()=>{
 const history=Array.from({length:8},(_,i)=>({role:'user' as const,content:String(i)}));
 const result=compactAssistantHistory([...history,{role:'call',name:'list',args:{},id:'1'},{role:'result',name:'list',result:{ok:true},id:'1'}]);
 expect(result[0]).toEqual(history[6]);expect(result.slice(-2).map(m=>m.role)).toEqual(['call','result']);
});
async function openaiTurn(responses:Response[]){
 for(const key of ['GEMINI_API_KEY','OPENROUTER_API_KEY','CLOUDFLARE_AI_TOKEN','KILO_API_KEY','OVH_AI_TOKEN','ZAI_API_KEY','NVIDIA_API_KEY','REQUESTY_API_KEY','GROQ_API_KEY','CEREBRAS_API_KEY','MISTRAL_API_KEY'])vi.stubEnv(key,'');
 vi.stubEnv('AI_KEYLESS','');vi.stubEnv('OPENROUTER_API_KEY','fixture');vi.stubEnv('AI_OPENROUTER_MODELS','one:free,two:free,three:free');
 const fetcher=vi.fn();for(const response of responses)fetcher.mockResolvedValueOnce(response);vi.stubGlobal('fetch',fetcher);
 return assistantTurn([{role:'user',content:'Check this job'}],[]);
}
it('reads content array text while ignoring private reasoning parts',async()=>{
 const turn=await openaiTurn([answer([{type:'reasoning',reasoning:'private'},{type:'text',text:'Ready'}])]);expect(turn?.text).toBe('Ready');
});
it.each([{id:'1',function:{name:'check',arguments:'```json\n{"id":"001"}\n```'}},{id:'1',function:{name:'check',arguments:{id:'001'}}}])('accepts fenced and object tool arguments',async call=>{
 const turn=await openaiTurn([Response.json({choices:[{message:{tool_calls:[call]}}]})]);expect(turn?.calls).toEqual([{id:'1',name:'check',args:{id:'001'}}]);
});
it('falls through reasoning only replies and upstream errors returned with HTTP 200',async()=>{
 const turn=await openaiTurn([Response.json({choices:[{message:{content:null,reasoning:'private'}}]}),answer('Ready')]);expect(turn?.text).toBe('Ready');expect(fetch).toHaveBeenCalledTimes(2);
 resetCooldowns();const turn2=await openaiTurn([Response.json({error:{code:'upstream_error',message:'private'}}),answer('Ready')]);expect(turn2?.text).toBe('Ready');
});
it('trims oversized old turns for Cloudflare without orphaning tool messages',async()=>{
 for(const provider of providers())vi.stubEnv(provider.kind==='gemini'?'GEMINI_API_KEY':provider.name.toUpperCase().split('/')[0]+'_API_KEY','');
 vi.stubEnv('AI_KEYLESS','');vi.stubEnv('CLOUDFLARE_AI_TOKEN','fixture');vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','fixture');vi.stubEnv('AI_CLOUDFLARE_MODELS','@cf/openai/gpt-oss-120b');
 const fetcher=vi.fn().mockResolvedValue(answer('Ready'));vi.stubGlobal('fetch',fetcher);
 const turn=await assistantTurn([{role:'user',content:'x'.repeat(100000)},{role:'call',name:'check',args:{},id:'1'},{role:'result',name:'check',result:{ok:true},id:'1'},{role:'user',content:'Now check this job'}],[]);
 expect(turn?.text).toBe('Ready');const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.messages.map((m:any)=>m.role)).toEqual(['system','user']);expect(body.messages[1].content).toBe('Now check this job');
});
it('redacts echoed prompt text and structured prompts from diagnostic bodies',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
 const privateText='Fixture private user question';
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('Invalid input: '+privateText,{status:400})));
 await withFallback('assistant',()=>({messages:[{role:'user',content:privateText}]}),()=>null,{},[p('groq')]);
 expect(JSON.stringify(warn.mock.calls)).not.toContain(privateText);
 resetCooldowns();
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({message:'Invalid input',prompt:privateText,messages:[{content:privateText}]},{status:400})));
 await withFallback('assistant',()=>({}),()=>null,{},[p('groq')]);
 expect(JSON.stringify(warn.mock.calls)).not.toContain(privateText);
});

it('accepts a fenced JSON assistant envelope',async()=>{
 const turn=await openaiTurn([answer('```json\n{"text":"Ready","tool_calls":[{"id":"1","function":{"name":"check","arguments":{"id":"001"}}}]}\n```')]);
 expect(turn?.text).toBe('Ready');expect(turn?.calls).toEqual([{id:'1',name:'check',args:{id:'001'}}]);
});
