import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({query:vi.fn(),ownerQuery:vi.fn(),fallback:vi.fn(),auth:vi.fn()}));
vi.mock('../lib/auth', () => ({requireUser:mocks.auth}));
vi.mock('../lib/db', () => ({withUser: async (_user:string, fn:Function) => fn({query:mocks.query}),withSystem:async(fn:Function)=>fn({query:mocks.ownerQuery})}));
vi.mock('../lib/ai', () => ({withFallback:mocks.fallback,stripThinking:(s:string)=>s}));
import { translateUi } from '../lib/services/translations';
import { POST } from '../app/api/i18n/translate/route';
import { ApiError } from '../lib/http';
beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue('user'); mocks.query.mockResolvedValue({rows:[]}); mocks.ownerQuery.mockResolvedValue({rows:[]}); mocks.fallback.mockResolvedValue(null); });
it('requires a signed in user even for English', async () => {
  mocks.auth.mockRejectedValue(new ApiError(401,'unauthenticated','Sign in to continue.'));
  const response = await POST(new Request('http://localhost/api/i18n/translate',{method:'POST',body:JSON.stringify({lang:'en-IN',strings:['Save']})}));
  expect(response.status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.fallback).not.toHaveBeenCalled();
});
it('returns English without database or AI access', async () => {
  expect(await translateUi('user',{lang:'en-IN',strings:['Save','Save']})).toEqual({translations:{Save:'Save'}});
  expect(mocks.query).not.toHaveBeenCalled();expect(mocks.fallback).not.toHaveBeenCalled();
});
it('returns cached entries and leaves misses in English when AI fails', async () => {
  mocks.query.mockResolvedValue({rows:[{source:'Save',translated:'حفظ'}]});
  expect(await translateUi('user',{lang:'ar-AE',strings:['Save','Cancel']})).toEqual({translations:{Save:'حفظ'}});
  expect(mocks.fallback).toHaveBeenCalledTimes(1);expect(mocks.ownerQuery).not.toHaveBeenCalled();
});
it('batches only unique misses and stores usable results', async () => {
  mocks.query.mockResolvedValue({rows:[{source:'Save',translated:'حفظ'}]});
  mocks.fallback.mockImplementation(async (_label, build, parse) => {
    const provider={kind:'openai',model:'test'};
    const request=build(provider);
    expect(request.messages[0].content).toContain('Strings: ["Cancel","Next"]');
    return parse(provider,{choices:[{message:{content:'{"Cancel":"إلغاء","Next":"التالي"}'}}]});
  });
  expect(await translateUi('user',{lang:'ar-AE',strings:['Save','Cancel','Next','Cancel']})).toEqual({translations:{Save:'حفظ',Cancel:'إلغاء',Next:'التالي'}});
  expect(mocks.fallback).toHaveBeenCalledTimes(1);
  expect(mocks.ownerQuery.mock.calls[0][1].slice(2)).toEqual([['Cancel','Next'],['إلغاء','التالي']]);
  expect(mocks.ownerQuery.mock.calls[0][1][1]).toEqual(expect.arrayContaining([expect.stringMatching(/^[a-f0-9]{64}$/)]));
});
it('does not call AI when every string is cached', async () => {
  mocks.query.mockResolvedValue({rows:[{source:'Save',translated:'حفظ'}]});
  await translateUi('user',{lang:'ar-AE',strings:['Save']});
  expect(mocks.fallback).not.toHaveBeenCalled();
});
it('returns usable translations even when the cache write fails', async () => {
  mocks.query.mockResolvedValue({rows:[{source:'Save',translated:'حفظ'}]});
  mocks.fallback.mockResolvedValue({Cancel:'إلغاء'});
  mocks.ownerQuery.mockRejectedValue(new Error('cache unavailable'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    expect(await translateUi('user',{lang:'ar-AE',strings:['Save','Cancel']})).toEqual({translations:{Save:'حفظ',Cancel:'إلغاء'}});
  } finally { warn.mockRestore(); }
});
it('rejects bad requests before accessing the cache or AI', async () => {
  await expect(translateUi('user',{lang:'ne',strings:Array(201).fill('Save')})).rejects.toThrow();
  expect(mocks.query).not.toHaveBeenCalled();
  expect(mocks.fallback).not.toHaveBeenCalled();
});
it('retries cached translations that changed protected data', async () => {
  mocks.query.mockResolvedValue({rows:[{source:'Open WO-12',translated:'افتح WO-13'}]});
  expect(await translateUi('user',{lang:'ar-AE',strings:['Open WO-12']})).toEqual({translations:{}});
  expect(mocks.fallback).toHaveBeenCalledTimes(1);
});
