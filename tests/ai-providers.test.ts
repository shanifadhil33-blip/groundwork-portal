import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { assistantTurn, providers, resetCooldowns, probeProvider } from '../lib/ai';

const keys = ['GEMINI_API_KEY','OPENROUTER_API_KEY','CLOUDFLARE_AI_TOKEN','KILO_API_KEY','OVH_AI_TOKEN','ZAI_API_KEY','NVIDIA_API_KEY','REQUESTY_API_KEY','GROQ_API_KEY','CEREBRAS_API_KEY','MISTRAL_API_KEY','GITHUB_MODELS_TOKEN'];
const ids = ['gemini','openrouter','cloudflare','kilo','ovh','zai','nvidia','requesty','groq','cerebras','mistral','github'];
beforeEach(() => {
 resetCooldowns();
 for (const key of keys) vi.stubEnv(key, '');
 for (const id of ids) vi.stubEnv(`AI_${id.toUpperCase()}_MODELS`, undefined);
 vi.stubEnv('AI_KEYLESS','');vi.stubEnv('AI_SPREAD','');vi.stubEnv('AI_USAGE_LOG','');
});
afterEach(() => { vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks(); });
const declaration = { name:'plan_day', description:'Plan a day', parameters:{type:'object',properties:{date:{type:'string'}},required:['date'],additionalProperties:false} };
const nativeCall={name:'plan_day',arguments:{date:'2026-10-23'}};
const openaiCall={id:'call1',type:'function',function:{name:'plan_day',arguments:JSON.stringify(nativeCall.arguments)}};

it.each(ids.filter(id=>id!=='github'))('%s sends its documented assistant request and parses a tool call', async id => {
 vi.stubEnv(keys[ids.indexOf(id)], 'test');
 vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','account');
 const fetcher=vi.fn().mockImplementation(async (_url, options) => {
  const body=JSON.parse(options.body);
  if(id==='gemini') {
   expect(body.contents).toEqual([{role:'user',parts:[{text:'Plan tomorrow for everyone'}]}]);
   expect(body.tools).toEqual([{functionDeclarations:[{...declaration,parameters:{type:'object',properties:{date:{type:'string'}},required:['date']}}]}]);
   expect(body.generationConfig.maxOutputTokens).toBe(2000);
   expect(body).not.toHaveProperty('model');
   return Response.json({candidates:[{content:{parts:[{functionCall:{name:nativeCall.name,args:nativeCall.arguments}}]}}]});
  }
  expect(body.messages[0].role).toBe('system');
  expect(body.messages[1]).toEqual({role:'user',content:'Plan tomorrow for everyone'});
  expect(body.max_tokens).toBe(2000);
  if(id==='cloudflare') {
   expect(_url).toBe('https://api.cloudflare.com/client/v4/accounts/account/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast');
   expect(body).not.toHaveProperty('model');
   expect(body.tools).toEqual([declaration]);
   return Response.json({success:true,result:{response:'',tool_calls:[nativeCall]}});
  }
  expect(body.tools).toEqual([{type:'function',function:declaration}]);
  expect(body.model).toBe(providers()[0].model);
  if(id==='zai')expect(body.thinking).toEqual({type:'disabled'});
  else expect(body).not.toHaveProperty('thinking');
  if(id==='openrouter') {
   expect(body.model).toBe('openrouter/free');
   expect(body.provider).toEqual({require_parameters:true,max_price:{prompt:0,completion:0}});
  }
  if(id==='kilo')expect(body.model).toBe('kilo-auto/free');
  return Response.json({choices:[{message:{content:null,tool_calls:[openaiCall]}}]});
 });
 vi.stubGlobal('fetch',fetcher);
 const turn=await assistantTurn([{role:'user',content:'Plan tomorrow for everyone'}],[declaration]);
 expect(fetcher).toHaveBeenCalledTimes(1);
 expect(turn?.calls[0]).toMatchObject({name:nativeCall.name,args:nativeCall.arguments});
});

it('keeps the Cloudflare GPT OSS override on Chat Completions with wrapped tools',async()=>{
 vi.stubEnv('CLOUDFLARE_AI_TOKEN','test');vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','account');vi.stubEnv('AI_CLOUDFLARE_MODELS','@cf/openai/gpt-oss-120b');
 const fetcher=vi.fn().mockResolvedValue(Response.json({choices:[{message:{content:'OK'}}]}));vi.stubGlobal('fetch',fetcher);
 expect((await assistantTurn([{role:'user',content:'Hello'}],[declaration]))?.text).toBe('OK');
 expect(fetcher.mock.calls[0][0]).toBe('https://api.cloudflare.com/client/v4/accounts/account/ai/v1/chat/completions');
 expect(JSON.parse(fetcher.mock.calls[0][1].body).tools).toEqual([{type:'function',function:declaration}]);
});
it.each(['openrouter','kilo','ovh','zai','cloudflare'])('%s preserves call and result history',async id=>{
 vi.stubEnv(keys[ids.indexOf(id)],'test');vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','account');
 const fetcher=vi.fn().mockResolvedValue(id==='cloudflare'?Response.json({success:true,result:{response:'Done'}}):Response.json({choices:[{message:{content:'Done'}}]}));vi.stubGlobal('fetch',fetcher);
 await assistantTurn([{role:'user',content:'Plan tomorrow'}, {role:'call',name:'plan_day',args:{date:'2026-10-23'},id:'call1'}, {role:'result',name:'plan_day',result:{ok:true},id:'call1'}],[declaration]);
 const messages=JSON.parse(fetcher.mock.calls[0][1].body).messages;
 expect(messages[2].tool_calls).toEqual([openaiCall]);
 expect(messages[3]).toEqual({role:'tool',tool_call_id:'call1',content:'{"ok":true}'});
});
it.each(['gemini','cloudflare','zai'])('%s omits tool configuration when there are no declarations',async id=>{
 vi.stubEnv(keys[ids.indexOf(id)],'test');vi.stubEnv('CLOUDFLARE_ACCOUNT_ID','account');
 const fetcher=vi.fn().mockResolvedValue(id==='gemini'?Response.json({candidates:[{content:{parts:[{text:'OK'}]}}]}):id==='cloudflare'?Response.json({success:true,result:{response:'OK'}}):Response.json({choices:[{message:{content:'OK'}}]}));vi.stubGlobal('fetch',fetcher);
 await assistantTurn([{role:'user',content:'Hello'}],[]);
 const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body).not.toHaveProperty('tools');expect(body).not.toHaveProperty('toolConfig');
});
it('health rejects an empty answer and never returns raw provider errors',async()=>{
 const p=providers({ZAI_API_KEY:'test'})[0];
 const fetcher=vi.fn().mockResolvedValueOnce(Response.json({choices:[]})).mockRejectedValueOnce(new Error('private'));
 vi.stubGlobal('fetch',fetcher);
 expect(await probeProvider(p)).toMatchObject({status:'error',code:200,ms:expect.any(Number)});
 const result=await probeProvider(p);expect(result).toMatchObject({status:'error',code:0});expect(JSON.stringify(result)).not.toContain('private');
 const body=JSON.parse(fetcher.mock.calls[0][1].body);expect(body.max_tokens).toBe(32);expect(body.thinking).toEqual({type:'disabled'});
});
it('Cloudflare success false is not accepted as an answer',async()=>{
 const p=providers({CLOUDFLARE_AI_TOKEN:'test',CLOUDFLARE_ACCOUNT_ID:'account'})[0];
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({success:false,errors:[{message:'private'}]})));
 expect(await probeProvider(p)).toMatchObject({status:'error'});
});

it('does not call the retired GitHub Models API',()=>{
 expect(providers({GITHUB_MODELS_TOKEN:'test'})).toEqual([]);
});
it('keeps keyless access opt in and never invents an authorization header',()=>{
 expect(providers({})).toEqual([]);
 const list=providers({AI_KEYLESS:'1'});
 expect([...new Set(list.map(p=>p.name.split('/')[0]))]).toEqual(['kilo','ovh']);
 expect(list.every(p=>!('Authorization' in p.headers))).toBe(true);
});
