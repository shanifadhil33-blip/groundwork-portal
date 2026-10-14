import { expect, it } from 'vitest';
import { tools } from '../lib/agent/tools';
it('the Agent can not create a request without what is wrong',()=>{
 const s=(tools as any).create_request.schema;
 expect(s.safeParse({title:'Leak',site_id:'40000000-0000-4000-8000-000000000001'}).success).toBe(false);
 expect(s.safeParse({title:'Leak',site_id:'40000000-0000-4000-8000-000000000001',description:'ok'}).success).toBe(false);
 expect(s.safeParse({title:'Leak',site_id:'40000000-0000-4000-8000-000000000001',description:'Water under the sink'}).success).toBe(true);
 expect((tools as any).create_request.write).toBe(true);
});
