import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
const {getSessionUserId}=vi.hoisted(()=>({getSessionUserId:vi.fn().mockResolvedValue(null)}));
vi.mock('../lib/auth',()=>({getSessionUserId}));
vi.mock('next/navigation',()=>({redirect:(url:string)=>{throw new Error('redirect:'+url);}}));
vi.mock('../components/public/sign-in-form',()=>({SignInForm:()=>null}));
import AuthError from '../app/(public)/auth/error/page';
import SessionEnded from '../app/(public)/session-ended/page';
import DemoEnded from '../app/(public)/demo-ended/page';
import GlobalError from '../app/global-error';
import NotFound from '../app/not-found';
import { NoAccess } from '../components/app/no-access';
import { ErrorState } from '../components/ui/states';
it('renders a public auth error with recovery navigation and no raw code',async()=>{
 const html=renderToStaticMarkup(await AuthError({searchParams:Promise.resolve({error:'sensitive-unknown'})}));
 expect(html).toContain('Try again');expect(html).toContain('Back to home');expect(html).not.toContain('sensitive-unknown');
});
it('keeps session callback destinations local',async()=>{
 const html=renderToStaticMarkup(await SessionEnded({searchParams:Promise.resolve({callbackUrl:'https://attacker.example'})}));
 expect(html).toContain('Your session ended');expect(html).toContain('Sign in again');expect(html).toContain('callbackUrl=%2Fdashboard');expect(html).not.toContain('attacker.example');
});
it('offers recovery for expired demos, missing pages, forbidden pages, fetch and global errors',async()=>{
 expect(renderToStaticMarkup(<DemoEnded/>)).toContain('Start a new demo');
 for(const element of [await NotFound(),<ErrorState retry={()=>{}}/>,<GlobalError retry={()=>{}}/>]) expect(renderToStaticMarkup(element)).toContain('Back to home');
 expect(renderToStaticMarkup(<NoAccess/>)).toContain('Go back');
 const missing=renderToStaticMarkup(await NotFound());expect(missing).not.toContain('Try again');expect(missing).toContain('Go back');expect(missing).toContain('public-footer');
 const global=renderToStaticMarkup(<GlobalError retry={()=>{}}/>);expect(global).toContain('<html');expect(global).toContain('<body');expect(global).toContain('#FFFFFF');expect(global).toContain('Try again');
});

it('redirects signed-in users away from sign-in and session-ended and gives missing pages signed-in navigation',async()=>{
 getSessionUserId.mockResolvedValue('signed-in');
 try{await expect(SessionEnded({searchParams:Promise.resolve({})})).rejects.toThrow('redirect:/dashboard');const {default:SignIn}=await import('../app/(public)/sign-in/page');await expect(SignIn({searchParams:Promise.resolve({})})).rejects.toThrow('redirect:/dashboard');const html=renderToStaticMarkup(await NotFound());expect(html).toContain('Go to dashboard');expect(html).not.toContain('Try the demo');expect(html).not.toContain('>Sign in<');}finally{getSessionUserId.mockResolvedValue(null);}
});
