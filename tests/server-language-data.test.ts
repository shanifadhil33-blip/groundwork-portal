import { beforeEach, expect, it, vi } from 'vitest';
const mocks=vi.hoisted(()=>({preferences:vi.fn(),withUser:vi.fn(async(_user:string,fn:()=>Promise<unknown>)=>fn())}));
vi.mock('server-only',()=>({}));
vi.mock('next/headers',()=>({headers:async()=>new Headers()}));
vi.mock('../lib/auth',()=>({requireUser:async()=>'user'}));
vi.mock('../lib/db',()=>({withUser:mocks.withUser}));
vi.mock('../lib/services/workspaces',()=>({me:async()=>({user:{id:'user',name:'Imran'},memberships:[]}),getWorkspace:vi.fn(),dashboard:vi.fn()}));
vi.mock('../lib/services/notifications',()=>({unreadCount:async()=>({unread_count:0})}));
vi.mock('../lib/services/settings',()=>({getPreferences:mocks.preferences}));
import { getAppPageData } from '../lib/server-page-data';

beforeEach(()=>{vi.clearAllMocks();});
it('seeds preferences within the signed in user context using the single read option', async()=>{
  mocks.preferences.mockResolvedValue({language:'ne'});
  const data=await getAppPageData();
  expect(data?.resources['/api/me/preferences']).toEqual({data:{language:'ne'}});
  expect(mocks.preferences).toHaveBeenCalledExactlyOnceWith('user',false);
  expect(mocks.withUser.mock.calls.every(([user])=>user==='user')).toBe(true);
});
it('keeps the page and client recovery when preferences fail', async()=>{
  mocks.preferences.mockRejectedValue(new Error('unavailable'));
  const data=await getAppPageData();
  expect(data?.user).toBe('user');
  expect(data?.resources['/api/me/preferences']).toBeUndefined();
  expect(data?.resources['/api/notifications/unread-count']).toEqual({data:{unread_count:0}});
});
it('uses the default language for someone without a preferences row', async()=>{
  mocks.preferences.mockResolvedValue(undefined);
  expect((await getAppPageData())?.resources['/api/me/preferences']).toMatchObject({data:{language:null,email_notifications:true,voice_enabled:true}});
});

it('starts each initial resource in a separate user scope and isolates failures', async()=>{
  const { initialResources } = await import('../lib/server-page-data');
  const { ApiError } = await import('../lib/http');
  let finish!:()=>void;
  const barrier=new Promise<void>(resolve=>{finish=resolve;});
  const started:string[]=[];
  const first=vi.fn(async()=>{started.push('first');await barrier;return {count:1};});
  const second=vi.fn(async()=>{started.push('second');await barrier;throw new ApiError(403,'forbidden','No access');});
  const pending=initialResources('user',[['/first',first],['/second',second]]);
  expect(started).toEqual(['first','second']);
  // An outer transaction would collapse both tasks into a single DB connection.
  expect(mocks.withUser).toHaveBeenCalledTimes(2);
  expect(mocks.withUser.mock.calls.every(([user])=>user==='user')).toBe(true);
  finish();
  expect(await pending).toMatchObject({'/first':{data:{count:1}},'/second':{error:{status:403,code:'forbidden'}}});
});
