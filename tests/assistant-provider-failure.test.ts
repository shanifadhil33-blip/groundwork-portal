import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { withFallback, resetCooldowns, type Provider } from '../lib/ai';
const provider:Provider={name:'gemini/test',kind:'gemini',url:'https://example.invalid',headers:{Authorization:'private test header'},model:'test'};
beforeEach(()=>resetCooldowns());
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it.each([
 ['quota',()=>Promise.resolve(new Response('Unsupported request: token=privateResponseToken',{status:429})),429],
 ['provider_error',()=>Promise.resolve(new Response('Unsupported request: token=privateResponseToken',{status:503})),503],
 ['timeout',()=>Promise.reject(Object.assign(new Error('private exception'),{name:'TimeoutError'})),0],
 ['network',()=>Promise.reject(new Error('private exception')),0],
 ['provider_error',()=>Promise.resolve(new Response('Unsupported request: token=privateResponseToken',{status:400})),400],
] as const)('%s failures have distinct safe server diagnostics',async(reason,response,status)=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
 vi.stubGlobal('fetch',vi.fn().mockImplementation(response));
 // Unique provider for each case avoids in-memory cooldown affecting other cases.
 const p={...provider,name:`gemini/test${status}${reason}`};
 expect(await withFallback('assistant',()=>({}),()=>null,{timeout:2000,deadline:5000},[p])).toBeNull();
 expect(warn).toHaveBeenCalledWith('[ai] provider failed',expect.objectContaining({provider:'gemini',status,reason}));
 if(status)expect(warn).toHaveBeenCalledWith('[ai] provider failed',expect.objectContaining({errorBody:'Unsupported request: token=[redacted]'}));
 expect(JSON.stringify(warn.mock.calls)).not.toMatch(/private|Authorization|example/);
});
it('no configured provider is distinguishable from failed providers',async()=>{
 const warn=vi.spyOn(console,'warn').mockImplementation(()=>undefined);
 expect(await withFallback('assistant',()=>({}),()=>null,{},[])).toBeNull();
 expect(warn).toHaveBeenCalledWith('[ai] fallback',{reason:'no_provider'});
});
