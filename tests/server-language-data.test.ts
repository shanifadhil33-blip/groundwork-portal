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
