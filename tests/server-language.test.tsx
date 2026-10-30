// @vitest-environment jsdom
import React, { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { appLanguageScript, LANG_HINT_KEY } from '../lib/head-scripts';
import { ServerLangProvider, useUiLang } from '../components/app/use-ui-lang';
import { InitialResourceProvider } from '../components/app/initial-resources';
import { useResource } from '../components/app/resource';
import { Translator } from '../components/app/translator';
import { languageFileUrl } from '../lib/i18n';

function run(language: unknown, blocked = false) {
  const root = {lang:'en',dir:'ltr',dataset:{translating:''} as Record<string,string>};
  const hints = new Map([[LANG_HINT_KEY,'ne']]);
  const storage = {
    setItem(key:string,value:string) { if(blocked)throw Error('blocked');hints.set(key,value); },
    removeItem(key:string) { if(blocked)throw Error('blocked');hints.delete(key); },
  };
  const timeout=vi.fn();
  new Function('document','localStorage','setTimeout',appLanguageScript(language))({documentElement:root},storage,timeout);
  return {root,hints,timeout};
}
describe('LANG01 slice 3 server language', () => {
  it.each(['ar-AE','ur','ps','fa-AF','fa-IR','ne','yo'])('sets the language and hint before paint for %s', lang => {
    const {root,hints,timeout}=run(lang);
    expect(root.lang).toBe(lang);
    expect(root.dir).toBe(['ne','yo'].includes(lang)?'ltr':'rtl');
    expect(root.dataset.translating).toBe('');
    expect(hints.get(LANG_HINT_KEY)).toBe(lang);
    expect(timeout).not.toHaveBeenCalled();
    expect(root.dataset.translating).toBe('');
  });
  it.each(['en-IN','en-US','en-GB'])('clears a stale hint for %s', lang => {
    const {root,hints}=run(lang);
    expect(root).toEqual({lang,dir:'ltr',dataset:{}});
    expect(hints.has(LANG_HINT_KEY)).toBe(false);
  });
  it('does not put unchecked values into the script', () => {
    for(const value of ["</script><script>alert('bad')</script>",'xx','en',null,{},42])expect(appLanguageScript(value)).toBe('');
  });
  it('sets document language even when storage is blocked', () => {
    expect(run('ps',true).root).toEqual({lang:'ps',dir:'rtl',dataset:{translating:''}});
    expect(run('en-IN',true).root).toEqual({lang:'en-IN',dir:'ltr',dataset:{}});
  });
  function Language() { return <span>{useUiLang()}</span>; }
  it('uses the provided server snapshot, with English as the fallback', () => {
    expect(renderToStaticMarkup(<ServerLangProvider language="ne"><Language/></ServerLangProvider>)).toBe('<span>ne</span>');
    expect(renderToStaticMarkup(<Language/>)).toBe('<span>en-IN</span>');
  });
  function Preference() {
    const preferences=useResource<{language:string}>('/api/me/preferences');
    return <span>{preferences.loading?'loading':preferences.data?.language}</span>;
  }
  it('has preferences ready on the first render before a fetch or effect', () => {
    expect(renderToStaticMarkup(<InitialResourceProvider resources={{'/api/me/preferences':{data:{language:'ps'}}}}><Preference/></InitialResourceProvider>)).toBe('<span>ps</span>');
  });
  it('starts the Translator with the server language on its first effect without fetching preferences', async () => {
    const container=document.createElement('div');
    document.body.appendChild(container);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
    const fetch=vi.fn(async()=>new Response('{}'));
    vi.stubGlobal('fetch',fetch);
    const root=createRoot(container);
    try {
      await act(async()=>root.render(<InitialResourceProvider resources={{'/api/me/preferences':{data:{language:'ps'}}}}><Translator/></InitialResourceProvider>));
      expect(document.documentElement.lang).toBe('ps');
      expect(document.documentElement.dir).toBe('rtl');
      expect(fetch).toHaveBeenCalledExactlyOnceWith(languageFileUrl('ps'),expect.objectContaining({mode:'cors',credentials:'same-origin'}));
    } finally {
      await act(async()=>root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  });
});
