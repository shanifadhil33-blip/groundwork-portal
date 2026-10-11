import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { assistantTurn, toGeminiSchema } from '../lib/ai';
// Import real tool schemas without initializing pools or connecting to Postgres.
vi.mock('../lib/auth',()=>({sessionCookie:{name:'test',options:{}}}));
vi.mock('../lib/db',()=>({asAgent:vi.fn(),withUser:vi.fn(),withSystem:vi.fn()}));
import { tools } from '../lib/agent/tools';
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.restoreAllMocks();});
describe('Gemini assistant schemas',()=>{
 it('sanitizes every tool without changing its source schema',()=>{
  for(const tool of Object.values(tools)){
   const source=z.toJSONSchema(tool.schema),before=JSON.stringify(source);
   const sanitized=JSON.stringify(toGeminiSchema(source));
   for(const key of ['$schema','additionalProperties','pattern'])expect(sanitized).not.toContain(`"${key}":`);
   expect(JSON.stringify(source)).toBe(before);
  }
 });
 it('inlines refs, converts constants and nullable branches, and strips unsupported constraints',()=>{
  expect(toGeminiSchema({$id:'test',$defs:{value:{type:'string',const:'yes',pattern:'yes',default:'yes',format:'uuid'}},type:'object',additionalProperties:false,properties:{answer:{$ref:'#/$defs/value'},when:{anyOf:[{type:'string',format:'date-time'},{type:'null'}]},count:{type:'number',exclusiveMinimum:0,exclusiveMaximum:10}}})).toEqual({type:'object',properties:{answer:{type:'string',enum:['yes']},when:{type:'string',format:'date-time',nullable:true},count:{type:'number'}}});
 });
 it('replays signed model parts unchanged and batches function responses',async()=>{
  vi.stubEnv('GEMINI_API_KEY','test');vi.stubEnv('GROQ_API_KEY','');
  const parts=[{text:'Checking.'},{functionCall:{name:'whoami',args:{}},thoughtSignature:'signature'},{functionCall:{name:'get_dashboard',args:{}}}];
  const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts}}]}))).mockResolvedValueOnce(new Response(JSON.stringify({candidates:[{content:{parts:[{text:'Done.'}]}}]})));
  vi.stubGlobal('fetch',fetcher);
  const declarations=[{name:'whoami',description:'Membership',parameters:z.toJSONSchema(z.object({}).strict())}];
  const turn=await assistantTurn([{role:'user',content:'Check workspace'}],declarations);
  expect(turn?.raw).toEqual(parts);
  await assistantTurn([{role:'user',content:'Check workspace'},...turn!.calls.map(call=>({role:'call' as const,...call,raw:turn!.raw})),...turn!.calls.map(call=>({role:'result' as const,name:call.name,id:call.id,result:{ok:true}}))],declarations);
  const body=JSON.parse(fetcher.mock.calls[1][1].body);
  expect(body.contents).toEqual([{role:'user',parts:[{text:'Check workspace'}]},{role:'model',parts},{role:'user',parts:[{functionResponse:{name:'whoami',response:{result:{ok:true}}}},{functionResponse:{name:'get_dashboard',response:{result:{ok:true}}}}]}]);
  expect(body.tools[0].functionDeclarations[0].parameters).toEqual({type:'object',properties:{}});
  expect(body.toolConfig.functionCallingConfig.mode).toBe('AUTO');
 });
});

it('defaults MCP comments to internal, while retaining an explicit client-visible choice',()=>{
 const args={work_order_id:'50000000-0000-4000-8000-000000000001',body:'Technician confirmed'};
 expect(tools.add_comment.schema.parse(args).visibility).toBe('internal');expect(tools.add_comment.schema.parse({...args,visibility:'client'}).visibility).toBe('client');
});
