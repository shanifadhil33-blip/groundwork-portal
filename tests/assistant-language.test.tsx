// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, readTranslationCache } from '../lib/i18n';
import { AssistantSuggestions, ListeningBar, STARTER_INTRO } from '../components/app/assistant-language';
import { setNotificationLanguage } from '../components/app/notification-language';

const locales = LANGUAGES.filter(l=>!isEnglish(l.code));
const file = (code:string) => JSON.parse(readFileSync(`public/i18n/${code}.json`,'utf8')) as Record<string,string>;
const rolePrompts = [
 ['How are my requests going?','Report a problem','When is the technician coming?'],
 ['What is my next job?','Job done, fixed it','I need a part'],
 ['Which jobs are late?','Create a new job','Add a note to a job'],
 ['Which jobs are late?','Who is free tomorrow?','Create a new job'],
].map(prompts=>[...prompts,'Show jobs waiting on parts']);
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
 vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
 setNotificationLanguage('',null);
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();setNotificationLanguage('',null);vi.unstubAllGlobals();});

it.each(locales)('$code has usable offline words for every listening string and every role starter',({code})=>{
 const raw=file(code),words=readTranslationCache(JSON.stringify(raw),code);
 for(const source of ['Listening','Cancel','Stop',STARTER_INTRO,...rolePrompts.flat()]){
  expect(words[source],`${code}: ${source}`).toBeTruthy();
  expect(words[source]).not.toBe(source);
  expect(words[source]).not.toMatch(/\p{Pd}/u);
 }
});
it.each(locales)('$code never paints English starters while loading or changing language',async({code})=>{
 for(const prompts of rolePrompts){
  const props={language:code,prompts,busy:false,submit:vi.fn()};
  // Server snapshot also reserves the same empty slots during hydration.
  const initial=renderToStaticMarkup(<AssistantSuggestions {...props}/>);
  expect(initial).not.toContain(STARTER_INTRO);
  expect(initial).not.toContain('Checking');
  await act(async()=>{setNotificationLanguage('en-IN',{});root.render(<AssistantSuggestions {...props}/>);});
  expect(host.textContent).toBe('');
  // Simulate a preference resolving before the translator publishes the new language.
  await act(async()=>{setNotificationLanguage(code,null);root.render(<AssistantSuggestions {...props}/>);});
  expect(host.querySelectorAll('button')).toHaveLength(4);
  expect(host.textContent).toBe('');
  expect(host.querySelector('[aria-busy=true]')).toBeTruthy();
  const slots=Array.from(host.querySelectorAll('p,button')).map(n=>n.tagName);
  await act(async()=>setNotificationLanguage(code,file(code)));
  expect(Array.from(host.querySelectorAll('p,button')).map(n=>n.tagName)).toEqual(slots);
  for(const prompt of prompts)expect(host.textContent).toContain(file(code)[prompt]);
  expect(host.textContent).not.toContain('Show jobs waiting on parts');
  await act(async()=>{(host.querySelector('button') as HTMLButtonElement).click();});
  expect(props.submit).toHaveBeenCalledWith(prompts[0]);
 }
});
it.each(locales)('$code renders the translated listening bar in language order with isolated time',async({code,rtl})=>{
 const cancel=vi.fn(),stop=vi.fn();
 await act(async()=>{setNotificationLanguage(code,file(code));root.render(<ListeningBar language={code} elapsed={65} cancel={cancel} stop={stop}/>);});
 const bar=host.querySelector('.voice-recording')!;
 expect(bar.getAttribute('dir')).toBe(rtl?'rtl':'ltr');
 expect(bar.querySelector('.voice-recording-label')?.textContent).toBe(file(code).Listening);
 expect(bar.querySelector('.voice-recording-time')?.getAttribute('dir')).toBe('ltr');
 expect(bar.textContent).toContain('1:05');
 const buttons=host.querySelectorAll('button');
 expect(Array.from(buttons).map(b=>b.textContent)).toEqual([file(code).Cancel,file(code).Stop]);
 await act(async()=>{buttons[0].click();buttons[1].click();});
 expect(cancel).toHaveBeenCalledOnce();expect(stop).toHaveBeenCalledOnce();
});
it('keeps bar contents shrinkable and tap targets inside its inline size',()=>{
 const css=readFileSync('app/globals.css','utf8');
 const rule=(selector:string)=>css.slice(css.indexOf(`${selector} {`)).split('}')[0];
 expect(rule('.voice-recording')).toContain('max-inline-size:100%');
 expect(rule('.voice-recording')).toContain('min-width:0');
 expect(rule('.voice-recording-label')).toContain('flex:1 1 0');
 expect(rule('.voice-recording-label')).toContain('min-width:0');
 expect(rule('.voice-recording-label')).toContain('text-overflow:ellipsis');
 // Match the specificity of the older mobile dialog footer rule that sets flex:none.
 const button=rule('.assistant-composer .voice-recording .button.button');
 for(const declaration of ['width:auto','inline-size:auto','flex:0 1 auto','min-inline-size:44px','min-block-size:44px','overflow-wrap:anywhere'])expect(button).toContain(declaration);
 expect(rule('.assistant-starters .button')).toContain('block-size:44px');
 expect(rule('.assistant-starters p')).toContain('block-size:3lh');
});
it('renders English immediately once English preferences are known',async()=>{
 await act(async()=>root.render(<AssistantSuggestions language="en-IN" prompts={rolePrompts[0]} busy={false} submit={()=>{}}/>));
 expect(host.textContent).toContain(STARTER_INTRO);
 expect(host.querySelector('.starter-placeholder')).toBeNull();
});
