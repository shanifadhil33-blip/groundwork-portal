// @vitest-environment jsdom
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import arabicWords from '../public/i18n/ar-AE.json';

vi.mock('server-only', () => ({}));
const mocks = vi.hoisted(() => ({ session: vi.fn(), preferences: vi.fn() }));
vi.mock('../lib/auth', () => ({ getSessionUserId: mocks.session }));
vi.mock('../lib/services/settings', () => ({ getPreferences: mocks.preferences }));
vi.mock('../app/(public)/sign-in/actions', () => ({ googleSignIn: vi.fn() }));
vi.mock('next/navigation', async original => ({
  ...await original<typeof import('next/navigation')>(),
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }),
}));
import SignIn from '../app/(public)/sign-in/page';
import Layout from '../app/(public)/layout';
import Privacy from '../app/(public)/privacy/page';
import Terms from '../app/(public)/terms/page';
import Join from '../app/(public)/join/page';
import { BackLink } from '../components/public/chrome';

let host: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue('person');
  mocks.preferences.mockResolvedValue({ language: 'ar-AE' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ signedIn: false }))));
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  localStorage.clear();
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  vi.unstubAllGlobals();
});

const pages = [
  ['privacy', () => Privacy()],
  ['terms', () => Terms()],
  ['join', () => Join({ searchParams: Promise.resolve({}) })],
] as const;

for (const [name, page] of pages) {
  it.each(['ar-AE', 'en-IN', 'en-US', null])(`renders shared chrome on ${name} for saved %s`, async language => {
    mocks.preferences.mockResolvedValue({ language });
    const arabic = language === 'ar-AE';
    host.innerHTML = renderToString(await Layout({ children: await page() }));
    const shell = host.querySelector('.public-shell')!;
    expect(shell.getAttribute('lang')).toBe(language ? arabic ? 'ar-AE' : 'en' : null);
    expect(shell.getAttribute('dir')).toBe(language ? arabic ? 'rtl' : 'ltr' : null);
    const header = host.querySelector('.public-header')!;
    expect(header.querySelector('a[href="/dashboard"]')?.textContent).toBe(arabic ? arabicWords['Go to dashboard'] : 'Go to dashboard');
    expect(header.querySelector('a[href="/sign-in"]')).toBeNull();
    expect(header.querySelector('.brand')?.getAttribute('aria-label')).toBe(arabic ? arabicWords['Groundwork home'] : 'Groundwork home');
    expect(header.querySelector('nav')?.getAttribute('aria-label')).toBe(arabic ? arabicWords['Public navigation'] : 'Public navigation');
    expect(host.querySelector('.public-footer a[href="/privacy"]')?.textContent).toBe(arabic ? arabicWords.Privacy : 'Privacy');
    expect(host.querySelector('.public-footer a[href="/terms"]')?.textContent).toBe(arabic ? arabicWords.Terms : 'Terms');
    if (name !== 'join') expect(host.querySelector('.back-link')?.textContent).toBe(arabic ? arabicWords.Home : 'Home');
    if (name === 'terms') {
      expect(host.querySelector('article h2')?.textContent).toBe(arabic ? 'ما هذا' : 'What this is');
      expect(host.querySelector('article')?.closest('[lang]')?.getAttribute('lang')).toBe(arabic ? 'ar-AE' : 'en');
      expect(host.querySelector('article')?.closest('[dir]')?.getAttribute('dir')).toBe(arabic ? 'rtl' : 'ltr');
    }
    for (const selector of ['.public-header', '.public-footer', '.back-link']) {
      expect(host.querySelector(selector)?.textContent ?? '').not.toMatch(/\p{Pd}/u);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it(`preserves the signed out chrome on ${name} despite a stale Arabic hint`, async () => {
    mocks.session.mockResolvedValue(null);
    localStorage.setItem('groundwork-lang', 'ar-AE');
    host.innerHTML = renderToString(await Layout({ children: await page() }));
    expect(host.querySelector('.public-shell')?.hasAttribute('lang')).toBe(false);
    expect(host.querySelector('.public-shell')?.hasAttribute('dir')).toBe(false);
    expect(host.querySelector('a[href="/sign-in"]')?.textContent).toBe('Sign in');
    expect(host.querySelector('a[href="/demo"]')?.textContent).toBe('Try the demo');
    expect(host.querySelector('[data-variant="in"]')?.textContent).toBe('Go to dashboard');
    if (name !== 'join') expect(host.querySelector('.back-link')?.textContent).toBe('Home');
    expect(mocks.preferences).not.toHaveBeenCalled();
  });
}

it.each(['ar-AE', 'en-IN'])('hydrates saved %s without changing chrome or calling a translation service', async language => {
  mocks.preferences.mockResolvedValue({ language });
  // Simulate client navigation from a page with the opposite document language.
  document.documentElement.lang = language === 'ar-AE' ? 'en' : 'ar-AE';
  document.documentElement.dir = language === 'ar-AE' ? 'ltr' : 'rtl';
  const page = await Layout({ children: <BackLink /> });
  host.innerHTML = renderToString(page);
  const serverHtml = host.innerHTML;
  const recoverableError = vi.fn();
  await act(async () => { root = hydrateRoot(host, page, { onRecoverableError: recoverableError }); });
  expect(recoverableError).not.toHaveBeenCalled();
  expect(host.innerHTML).toBe(serverHtml);
  expect(document.documentElement.lang).toBe(language === 'ar-AE' ? 'ar-AE' : 'en');
  expect(document.documentElement.dir).toBe(language === 'ar-AE' ? 'rtl' : 'ltr');
  expect(fetch).not.toHaveBeenCalled();
});

it.each(['privacy', 'terms'] as const)('lays %s out right to left while Arabic is shown and for saved Urdu', async name => {
  const Page = name === 'privacy' ? Privacy : Terms;
  const notice = name === 'privacy' ? '.privacy-notice' : '.terms-notice';
  mocks.preferences.mockResolvedValue({ language: 'en-IN' });
  const english = await Layout({ children: await Page() });
  host.innerHTML = renderToString(english);
  const recoverableError = vi.fn();
  await act(async () => { root = hydrateRoot(host, english, { onRecoverableError: recoverableError }); });
  expect(recoverableError).not.toHaveBeenCalled();
  expect(document.documentElement.dir).toBe('ltr');
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('ltr');
  await act(async () => host.querySelector<HTMLButtonElement>('button[lang="ar-AE"]')!.click());
  expect(document.documentElement.dir).toBe('rtl');
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('rtl');
  expect(host.querySelector(notice)?.getAttribute('dir')).toBe('rtl');
  expect(host.querySelector('.back-link')?.getAttribute('dir')).toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>('button[lang="en"]')!.click());
  expect(document.documentElement.dir).toBe('ltr');
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('ltr');
  expect(host.querySelector(notice)?.getAttribute('dir')).toBe('ltr');
  await act(async () => root!.unmount());
  root = undefined;

  mocks.preferences.mockResolvedValue({ language: 'ur' });
  const urdu = await Layout({ children: await Page() });
  host.innerHTML = renderToString(urdu);
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('rtl');
  expect(host.querySelector(notice)?.getAttribute('dir')).toBe('rtl');
  expect(host.querySelector(notice)?.getAttribute('lang')).toBe('en');
  document.documentElement.dir = 'ltr';
  await act(async () => { root = hydrateRoot(host, urdu, { onRecoverableError: recoverableError }); });
  expect(recoverableError).not.toHaveBeenCalled();
  expect(document.documentElement.dir).toBe('rtl');
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('rtl');
  await act(async () => root!.unmount());
  root = undefined;

  mocks.session.mockResolvedValue(null);
  document.documentElement.dir = 'rtl';
  const guest = await Layout({ children: await Page() });
  host.innerHTML = renderToString(guest);
  expect(host.querySelector('.public-shell')?.hasAttribute('dir')).toBe(false);
  await act(async () => { root = hydrateRoot(host, guest, { onRecoverableError: recoverableError }); });
  expect(recoverableError).not.toHaveBeenCalled();
  expect(document.documentElement.dir).toBe('ltr');
  await act(async () => host.querySelector<HTMLButtonElement>('button[lang="ar-AE"]')!.click());
  expect(document.documentElement.dir).toBe('rtl');
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('rtl');
  await act(async () => host.querySelector<HTMLButtonElement>('button[lang="en"]')!.click());
  expect(document.documentElement.dir).toBe('ltr');
  expect(host.querySelector('.public-shell')?.hasAttribute('dir')).toBe(false);
  expect(host.querySelector(notice)?.getAttribute('dir')).toBe('ltr');
});

it.each(['ar', 'AR-eg', 'ar-SA'])('uses the existing Gulf Arabic chrome for saved %s', async language => {
  mocks.preferences.mockResolvedValue({ language });
  host.innerHTML = renderToString(await Layout({ children: <BackLink /> }));
  expect(host.querySelector('.back-link')?.textContent).toBe(arabicWords.Home);
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('rtl');
});

it('uses other saved language files and preserves explicit back link labels and destinations', async () => {
  mocks.preferences.mockResolvedValue({ language: 'ur' });
  host.innerHTML = renderToString(await Layout({ children: <BackLink href="/custom" label="Custom destination" /> }));
  expect(host.querySelector('.public-shell')?.getAttribute('lang')).toBe('ur');
  expect(host.querySelector('.public-shell')?.getAttribute('dir')).toBe('rtl');
  expect(host.querySelector('.back-link')?.textContent).toBe('Custom destination');
  expect(host.querySelector('.back-link')?.getAttribute('href')).toBe('/custom');
});

it('keeps the signed out sign in page chrome in English', async () => {
  mocks.session.mockResolvedValue(null);
  const page = await SignIn({ searchParams: Promise.resolve({}) });
  host.innerHTML = renderToString(await Layout({ children: page }));
  expect(host.querySelector('.back-link')?.textContent).toBe('Home');
  expect(host.querySelector('.public-header a[href="/sign-in"]')?.textContent).toBe('Sign in');
  expect(mocks.preferences).not.toHaveBeenCalled();
});

it.each(['ar-AE', 'en-IN'])('preserves the dashboard redirect for a signed in %s user on sign in', async language => {
  mocks.preferences.mockResolvedValue({ language });
  await expect(SignIn({ searchParams: Promise.resolve({}) })).rejects.toThrow('redirect:/dashboard');
});

it('keeps English chrome for a signed in user without a preference row', async () => {
  mocks.preferences.mockResolvedValue(undefined);
  host.innerHTML = renderToString(await Layout({ children: <BackLink /> }));
  expect(host.querySelector('.back-link')?.textContent).toBe('Home');
  expect(host.querySelector('.public-header a[href="/dashboard"]')?.textContent).toBe('Go to dashboard');
  expect(host.querySelector('.public-shell')?.hasAttribute('lang')).toBe(false);
  expect(mocks.preferences).toHaveBeenCalledExactlyOnceWith('person', false);
});
