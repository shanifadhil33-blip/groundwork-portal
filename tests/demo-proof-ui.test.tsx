// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { expect, it, vi } from 'vitest';
import { AppContext } from '../components/app/context';
import { InitialResourceProvider } from '../components/app/initial-resources';
import { Translator } from '../components/app/translator';
import { demoJobTranslations } from '../lib/demo-job-copy';
import { DEMO_PROOF_COPY } from '../lib/demo-proof-copy';

it.each([true, false])('sample proof uses file translations only in demo: %s', async demo => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  localStorage.clear();
  const raw = readFileSync('public/i18n/ar-AE.json', 'utf8');
  const translations = JSON.parse(raw);
  Object.assign(translations, demoJobTranslations(translations));
  const fetch = vi.fn(async () => new Response(raw));
  vi.stubGlobal('fetch', fetch);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <AppContext.Provider value={{ me: { user: { id: 'viewer', name: 'Ravi', email: null, image: null }, memberships: [] }, member: null,
        workspace: { id: 'workspace', name: 'Sample', is_demo: demo, timezone: 'Asia/Dubai', country: 'AE', region: 'Dubai', currency: 'AED' }, reload() {}, updateName() {} }}>
        <InitialResourceProvider resources={{ '/api/me/preferences': { data: { language: 'ar-AE' } } }}>
          {[...DEMO_PROOF_COPY].map(word => <p key={word} data-no-translate data-sample={word}>{word}</p>)}
          <p data-no-translate data-writing>My own words</p>
          <textarea defaultValue="Sample drawings" />
          <Translator />
        </InitialResourceProvider>
      </AppContext.Provider>
    ));
    for (const word of DEMO_PROOF_COPY) expect(container.querySelector(`[data-sample="${word}"]`)?.textContent).toBe(demo ? translations[word] : word);
    expect(container.querySelector('[data-writing]')?.textContent).toBe('My own words');
    expect(container.querySelector('textarea')?.value).toBe('Sample drawings');
    expect(fetch).toHaveBeenCalledExactlyOnceWith('/i18n/ar-AE.json', expect.any(Object));
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
