import { expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';
const mocks=vi.hoisted(()=>({query:vi.fn(async()=>({rows:[]})),get:vi.fn(async()=>new Response('ok')),post:vi.fn(async()=>new Response('ok'))}));
vi.mock('../lib/auth',()=>({handlers:{GET:mocks.get,POST:mocks.post},sessionCookie:{name:'authjs.session-token'}}));
vi.mock('../lib/db',()=>({ownerPool:{query:mocks.query}}));
import { GET, POST } from '../app/api/auth/[...nextauth]/route';
it('deletes a previous session and passes only the other cookies to Auth.js',async()=>{
 mocks.query.mockClear();mocks.get.mockClear();
 const original=new Request('https://example.com/api/auth/callback/google',{headers:{cookie:'authjs.session-token=demo; authjs.state=state; authjs.pkce.code_verifier=pkce'}});
 await GET(original as NextRequest);
 expect(mocks.query).toHaveBeenCalledWith('DELETE FROM sessions WHERE "sessionToken"=$1',['demo']);
 const passed=mocks.get.mock.calls[0] as unknown as [Request];
 expect(passed[0].headers.get('cookie')?.trim()).toBe('authjs.state=state; authjs.pkce.code_verifier=pkce');
 expect(original.headers.get('cookie')).toContain('session-token=demo');
 expect(mocks.query.mock.invocationCallOrder[0]).toBeLessThan(mocks.get.mock.invocationCallOrder[0]);
});
it('preserves POST body on provider sign-in and clears the demo marker',async()=>{
 mocks.post.mockClear();
 const response=await POST(new Request('https://example.com/api/auth/signin/google',{method:'POST',body:'csrfToken=csrf',headers:{cookie:'authjs.session-token=demo; authjs.csrf-token=csrf'}}) as NextRequest);
 const passed=mocks.post.mock.calls[0] as unknown as [Request];
 expect(await passed[0].text()).toBe('csrfToken=csrf');expect(response.headers.get('set-cookie')).toContain('Max-Age=0');
});
it('leaves unrelated auth endpoints untouched',async()=>{
 mocks.query.mockClear();mocks.get.mockClear();
 const req=new Request('https://example.com/api/auth/session',{headers:{cookie:'authjs.session-token=demo'}});
 await GET(req as NextRequest);expect(mocks.query).not.toHaveBeenCalled();expect(mocks.get).toHaveBeenCalledWith(req);
});
