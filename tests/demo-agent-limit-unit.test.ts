import { expect, it, vi } from 'vitest';
vi.mock('../lib/db',()=>({withSystem:vi.fn()}));
import { DEMO_LIMITS } from '../lib/services/demo-agent-limit';
it('preserves DEMO14 allowances',()=>{
 expect(DEMO_LIMITS).toEqual({short:{n:20,minutes:10},hour:{n:60,minutes:60},all:{n:400,minutes:60},day:{n:1000,minutes:1440}});
});
