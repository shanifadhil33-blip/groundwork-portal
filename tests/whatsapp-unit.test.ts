import { afterEach,expect,it,vi } from 'vitest';
import { parseWhatsApp,phoneKey } from '../lib/services/whatsapp';
import { POST } from '../app/api/webhooks/whatsapp/route';
afterEach(()=>vi.unstubAllEnvs());
it('uses the incoming message in the suggestion model',()=>{
 expect(parseWhatsApp({from:'+971 50 000 1234',name:'Faisal',text:'Tap leaks. Please visit Saturday',media:[]})).toMatchObject({title:'Tap leaks',problem:'Tap leaks. Please visit Saturday',phone:'971500001234',photo_ids:[]});
 expect(phoneKey('00971 50 000 1234')).toBe('971500001234');
 expect(()=>parseWhatsApp({from:'12345',name:'Faisal',text:''})).toThrow();
});
it('does not accept an unconnected webhook or an incorrect secret',async()=>{
 vi.stubEnv('WHATSAPP_WEBHOOK_SECRET','');expect(await (await POST(new Request('http://local',{method:'POST'}))).text()).toBe('not connected');
 vi.stubEnv('WHATSAPP_WEBHOOK_SECRET','sample');expect((await POST(new Request('http://local',{method:'POST',headers:{'x-whatsapp-secret':'wrong'}}))).status).toBe(401);
 expect((await POST(new Request('http://local',{method:'POST',headers:{'x-whatsapp-secret':'sample'}}))).status).toBe(503);
});
