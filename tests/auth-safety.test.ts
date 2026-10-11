import { describe, expect, it, vi } from 'vitest';
import type { Adapter, AdapterAccount } from 'next-auth/adapters';
import { stripSessionCookie, withoutSessionCookie } from '../lib/auth-callback';
import { guardDemoAccountLinking, maySignIn } from '../lib/auth-guards';
import { authErrorCopy, authErrors } from '../lib/ui/auth-errors';

describe('OAuth session isolation', () => {
  it.each(['authjs.session-token','__Secure-authjs.session-token'])('removes only %s', name => {
    const others='authjs.state=state; authjs.pkce.code_verifier=pkce; authjs.csrf-token=csrf; authjs.callback-url=%2Fdashboard';
    const result=stripSessionCookie(`${name}=demo; ${others}; other=abc=def`,name);
    expect(result.tokens).toEqual(['demo']);
    expect(result.cookie?.trim()).toBe(`${others}; other=abc=def`);
    expect(stripSessionCookie(`${name}.other=keep; ${name}=a; ${name}=b`,name)).toEqual({cookie:`${name}.other=keep`,tokens:['a','b']});
  });
  it('handles missing, unrelated and session-only headers', () => {
    expect(stripSessionCookie(null,'session')).toEqual({cookie:null,tokens:[]});
    expect(stripSessionCookie('a=1; b=2','session')).toEqual({cookie:'a=1; b=2',tokens:[]});
    expect(stripSessionCookie('session=demo','session')).toEqual({cookie:'',tokens:['demo']});
  });
  it('clones POST without consuming its body or changing OAuth cookies', async () => {
    const original=new Request('https://example.com/api/auth/callback/google',{method:'POST',body:'code=example',headers:{cookie:'session=demo; authjs.state=state','content-type':'application/x-www-form-urlencoded'}});
    const clean=withoutSessionCookie(original,'session');
    expect(clean.request.method).toBe('POST');expect(clean.request.headers.get('cookie')?.trim()).toBe('authjs.state=state');
    expect(await clean.request.text()).toBe('code=example');expect(await original.text()).toBe('code=example');
  });
});
describe('sign-in and linking guards', () => {
  it('requires strictly verified Google email', () => {
    for (const emailVerified of [undefined,false,'true',1]) expect(maySignIn({email:'real@example.com',provider:'google',emailVerified})).toBe(false);
    expect(maySignIn({email:'real@example.com',provider:'google',emailVerified:true})).toBe(true);
    expect(maySignIn({email:'real@example.com',provider:'other'})).toBe(true);
  });
  it('rejects demo flags and demo email identities', () => {
    expect(maySignIn({isDemo:true,email:'real@example.com',provider:'google',emailVerified:true})).toBe(false);
    expect(maySignIn({email:'Dana@DEMO.GROUNDWORK.INVALID',provider:'google',emailVerified:true})).toBe(false);
  });
  it('refuses demo account linking before calling the adapter', async () => {
    const linkAccount=vi.fn(async (account:AdapterAccount)=>account), getSessionAndUser=vi.fn();
    const base:Adapter={linkAccount,getSessionAndUser};
    const account={userId:'demo',provider:'google',providerAccountId:'google-id',type:'oauth'} as AdapterAccount;
    const guarded=guardDemoAccountLinking(base,async id=>id==='demo');
    await expect(guarded.linkAccount!(account)).rejects.toThrow('Demo accounts');expect(linkAccount).not.toHaveBeenCalled();
    await expect(guarded.linkAccount!({...account,userId:'real'})).resolves.toEqual({...account,userId:'real'});
    expect(guarded.getSessionAndUser).toBe(getSessionAndUser);
  });
});
describe('friendly sign-in errors', () => {
  it.each(Object.keys(authErrors))('maps %s to friendly copy', code=>{
    const copy=authErrorCopy(code);expect(copy).toBe(authErrors[code as keyof typeof authErrors]);expect(copy.title.length).toBeGreaterThan(10);expect(copy.message).not.toContain(code);
  });
  it('never echoes unknown codes including prototype names',()=>{
    for(const code of ['<script>private</script>','OAuthCallbackError','OAuthSignin','CallbackRouteError','toString',undefined,['AccessDenied']])expect(authErrorCopy(code)).toEqual(authErrorCopy('unknown'));
  });
});
