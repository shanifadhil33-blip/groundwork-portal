import { expect, it, vi } from 'vitest';
import { runHealth } from '../scripts/ai-health.mjs';
it('probes one model per provider sequentially and prints only safe fields',async()=>{
 const list=[{name:'kilo/private override',headers:{Authorization:'private'}},{name:'kilo/second'},{name:'ovh/model'},{name:'private/custom'}];
 let running=false;
 const probe=vi.fn(async()=>{expect(running).toBe(false);running=true;await Promise.resolve();running=false;return {status:'ok',ms:7,code:200,body:'private'};});
 const write=vi.fn();expect(await runHealth({list,probe,write})).toBe(0);
 expect(probe).toHaveBeenCalledTimes(3);
 expect(write.mock.calls.flat()).toEqual(['provider status ms','kilo ok 7','ovh ok 7','custom ok 7']);
});
it('errors set a failing exit code without printing response text or exceptions',async()=>{
 const probe=vi.fn().mockResolvedValueOnce({status:'error',code:400,ms:3,body:'private'}).mockRejectedValueOnce(new Error('private'));
 const write=vi.fn();expect(await runHealth({list:[{name:'gemini/model'},{name:'zai/model'}],probe,write})).toBe(1);
 expect(write.mock.calls[1][0]).toBe('gemini error(400) 3');
 expect(write.mock.calls[2][0]).toMatch(/^zai error \d+$/);
 expect(JSON.stringify(write.mock.calls)).not.toContain('private');
});
