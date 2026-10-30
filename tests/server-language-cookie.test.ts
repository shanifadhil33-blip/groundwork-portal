import {expect,it,vi} from 'vitest';
const state=vi.hoisted(()=>({language:'hi',signedIn:true}));
vi.mock('../lib/auth',()=>({requireUser:async()=>{if(!state.signedIn)throw Error('signed out');return 'imran';},signOut:async()=>{},getSessionUserId:async()=>null}));
vi.mock('../lib/services/settings',()=>({getPreferences:async()=>({language:state.language}),patchPreferences:async(_user:string,body:{language:string})=>({language:body.language})}));
vi.mock('../lib/services/onboarding',()=>({getOnboarding:async()=>({answers:{language:'hi'}}),saveOnboarding:async()=>({answers:{language:'ur'}})}));
import {POST as signOut} from '../app/api/auth/sign-out/route';
import {PATCH as onboarding} from '../app/api/onboarding/route';
import {GET,PATCH} from '../app/api/me/preferences/route';
import {languageCookie} from '../lib/language-cookie';
it.each(['hi','ar-AE','ur','en-IN'])('sets a validated long lived cookie on read and save for %s',async language=>{
 state.language=language;
 for(const response of [await GET(new Request('http://localhost/api/me/preferences')),await PATCH(new Request('http://localhost/api/me/preferences',{method:'PATCH',body:JSON.stringify({language})}))]){
 expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toBe(languageCookie(language));
 }
});
it('uses English for invalid values and does not set a preference cookie on an unauthenticated read',async()=>{
 expect(languageCookie('bad; injected=yes')).toBe(languageCookie('en-IN'));
 state.signedIn=false;
 expect((await GET(new Request('http://localhost/api/me/preferences'))).headers.get('set-cookie')).toBeNull();
 state.signedIn=true;
});

it('persists onboarding language and clears the hint on sign out',async()=>{
 const saved=await onboarding(new Request('http://localhost/api/onboarding',{method:'PATCH',body:'{}'}));
 expect(saved.headers.get('set-cookie')).toBe(languageCookie('ur'));
 const response=await signOut(new Request('http://localhost/api/auth/sign-out',{method:'POST',headers:{Origin:'http://localhost'}}));
 expect(response.status).toBe(200);expect(response.headers.get('set-cookie')).toContain('gw-lang=; Path=/; SameSite=Lax; Max-Age=0');
});
