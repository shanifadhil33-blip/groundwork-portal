import { afterEach, expect, it, vi } from 'vitest';
import { request, RequestError, handleSessionFailure } from '../lib/ui/api';
import { requestErrorCopy } from '../lib/ui/request-errors';
import { parseFile } from '../lib/import/parse';
afterEach(()=>vi.unstubAllGlobals());
it('sanitizes network and server failures',async()=>{
 vi.stubGlobal('fetch',vi.fn().mockRejectedValue(new Error('private transport details')));
 await expect(request('/api/me')).rejects.toMatchObject({status:0,code:'network',message:requestErrorCopy(0)});
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue(Response.json({error:{message:'private stack'}},{status:503})));
 await expect(request('/api/me')).rejects.toMatchObject({status:503,message:requestErrorCopy(503)});
});
it('describes permissions and rate limits without technical codes',()=>{
 expect(requestErrorCopy(403)).toContain('access');expect(requestErrorCopy(429)).toContain('wait');
});
it('rejects empty uploads and header-only files with specific reasons',()=>{
 expect(()=>parseFile(Buffer.alloc(0),'empty.csv')).toThrow('empty');
 expect(()=>parseFile(Buffer.from('title,description\n'),'empty.csv')).toThrow('no data rows');
 expect(()=>parseFile(Buffer.from('title,title\na,b'),'bad.csv')).toThrow('give every column a unique header');
});

it('sends signed-out visitors to sign-in and genuine expiry to the session-ended page',()=>{
 const replace=vi.fn();vi.stubGlobal('window',{location:{pathname:'/work-orders',search:'?status=scheduled',replace}});vi.stubGlobal('document',{cookie:''});
 handleSessionFailure(401,'unauthenticated');expect(replace.mock.calls.at(-1)?.[0]).toBe('/sign-in?callbackUrl=%2Fwork-orders%3Fstatus%3Dscheduled');
 handleSessionFailure(401,'session_expired');expect(replace.mock.calls.at(-1)?.[0]).toBe('/session-ended?callbackUrl=%2Fwork-orders%3Fstatus%3Dscheduled');
 handleSessionFailure(401,'demo_ended');expect(replace.mock.calls.at(-1)?.[0]).toBe('/demo-ended');
});
