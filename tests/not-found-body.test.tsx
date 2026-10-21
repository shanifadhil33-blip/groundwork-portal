// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NotFoundBody } from '../components/public/not-found-body';
import { LANGUAGES } from '../lib/languages';

const preferences = vi.hoisted(() => ({ language: 'ar-AE' }));
vi.mock('../components/app/resource', () => ({
  useResource: () => ({ data: preferences }),
}));
const title = 'We couldn’t open that page.';
const message = 'The link may be old, or this page needs you to sign in.';
const dictionary = (code: string): Record<string, string> => JSON.parse(readFileSync(`${process.cwd()}/public/i18n/${code}.json`, 'utf8'));
let host: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['en-US']);
  document.documentElement.lang = 'ar-AE';
  document.documentElement.dir = 'rtl';
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  fetchMock = vi.fn(async (url: string) => {
    if (url === '/api/session') return { ok: true, json: async () => ({ signedIn: false }) };
    if (url.startsWith('/i18n/')) {
      const words = dictionary(url.slice(6, -5));
      return { ok: true, json: async () => words, text: async () => JSON.stringify(words) };
    }
    throw new Error('Unexpected request');
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
});
const render = () => act(async () => root.render(<NotFoundBody />));

it.each(['en-US', 'ar-AE', 'hi-IN', 'ur-PK', 'ps-AF', 'fa-IR', 'fa-AF', 'ta-IN'])(
  'uses saved browser words and direction for %s without a translation service call', async locale => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([locale]);
    await render();
    const language = LANGUAGES.find(l => l.code === locale)
      ?? LANGUAGES.find(l => l.code.split('-')[0] === locale.split('-')[0])!;
    const words = locale.startsWith('en') ? {} : dictionary(language.code);
    const page = host.querySelector('.lost-page')!;
    expect(page.getAttribute('dir')).toBe(language.rtl ? 'rtl' : 'ltr');
    expect(page.getAttribute('lang')).toBe(locale.startsWith('en') ? 'en' : language.code);
    expect(host.querySelectorAll('.lost-card')).toHaveLength(1);
    expect(host.querySelector('h1')?.textContent).toBe(words[title] ?? title);
    expect(host.querySelector('.lost-card p')?.textContent).toBe(words[message] ?? message);
    const actions = [...host.querySelectorAll('.lost-actions a')];
    expect(actions.map(a => a.getAttribute('href'))).toEqual(['/sign-in', '/']);
    expect(actions.map(a => a.textContent)).toEqual([words['Sign in'] ?? 'Sign in', words['Back to home'] ?? 'Back to home']);
    expect(host.querySelector('footer')).not.toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(locale.startsWith('en') ? ['/api/session'] : ['/api/session', `/i18n/${language.code}.json`]);
  },
);

it('honours the first supported browser preference', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['xx', 'hi-IN', 'ar-AE']);
  await render();
  expect(host.querySelector('.lost-page')?.getAttribute('lang')).toBe('hi');
});

it.each(['offline', 'http', 'invalid', 'missing'])(
  'keeps English actions usable when the word file is %s', async failure => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ar-AE']);
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/session') return { ok: true, json: async () => ({ signedIn: false }) };
      if (failure === 'offline') throw new Error('Offline');
      return { ok: failure !== 'http', json: async () => failure === 'invalid' ? { [title]: {} } : {} };
    });
    await render();
    expect(host.querySelector('h1')?.textContent).toBe(title);
    expect(host.querySelector('.lost-actions a')?.textContent).toBe('Sign in');
  },
);

it('keeps the signed in screen and translates its dashboard action using his preference', async () => {
  vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['hi-IN']);
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/session') return { ok: true, json: async () => ({ signedIn: true }) };
    if (url === '/i18n/ar-AE.json') return { ok: true, text: async () => JSON.stringify(dictionary('ar-AE')) };
    return { ok: true, json: async () => ({ translations: {} }) };
  });
  await render();
  expect(host.querySelector('.lost-page')).toBeNull();
  await act(async () => {
    await vi.waitFor(() => expect(host.querySelector('.error-actions a[href="/dashboard"]')?.textContent).toBe(dictionary('ar-AE')['Go to dashboard']));
  });
  expect(document.documentElement.dir).toBe('rtl');
  expect(document.documentElement.lang).toBe('ar-AE');
  expect(fetchMock.mock.calls.some(([url]) => url === '/i18n/hi.json')).toBe(false);
});

it('ships the four card phrases in every non English language', () => {
  for (const language of LANGUAGES.filter(l => !l.code.startsWith('en'))) {
    const words = dictionary(language.code);
    for (const key of [title, message, 'Sign in', 'Back to home']) {
      expect(typeof words[key], `${language.code}: ${key}`).toBe('string');
      expect(words[key].trim().length).toBeGreaterThan(0);
      expect(words[key]).not.toMatch(/[—–-]/);
    }
  }
});
