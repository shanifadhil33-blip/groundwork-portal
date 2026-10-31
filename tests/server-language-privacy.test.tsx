// @vitest-environment jsdom
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({ session: vi.fn(), preferences: vi.fn() }));
vi.mock('../lib/auth', () => ({ getSessionUserId: mocks.session }));
vi.mock('../lib/services/settings', () => ({ getPreferences: mocks.preferences }));
import Page from '../app/(public)/privacy/page';

let host: HTMLDivElement;
let root: Root | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.session.mockResolvedValue('person');
  mocks.preferences.mockResolvedValue({ language: 'ar-AE' });
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

function expectNotice(arabic: boolean) {
  const notice = host.querySelector('.privacy-notice')!;
  expect(notice.getAttribute('lang')).toBe(arabic ? 'ar-AE' : 'en');
  expect(notice.getAttribute('dir')).toBe(arabic ? 'rtl' : 'ltr');
  expect(notice.hasAttribute('data-no-translate')).toBe(true);
  expect(notice.querySelector('h1')?.textContent).toBe(arabic ? 'الخصوصية وبياناتك' : 'Privacy and your data');
  expect(notice.querySelectorAll('article section')).toHaveLength(8);
  expect(notice.querySelector('button[aria-pressed="true"]')?.textContent).toBe(arabic ? 'العربية' : 'English');
  expect(notice.textContent).not.toMatch(/[-–—]/);
  expect(notice.textContent).not.toMatch(/portfolio|Adhil Shanif|عادل شنيف/i);
  return notice;
}

it.each(['ar-AE', 'ar', 'ar-SA', 'AR-eg'])('renders Arabic with RTL in the server HTML for saved %s', async language => {
  mocks.preferences.mockResolvedValue({ language });
  host.innerHTML = renderToString(await Page());
  expectNotice(true);
  expect(mocks.preferences).toHaveBeenCalledExactlyOnceWith('person', false);
});

it.each(['demo-persona', 'practice-persona'])('uses the same saved preference read for %s', async user => {
  mocks.session.mockResolvedValue(user);
  host.innerHTML = renderToString(await Page());
  expectNotice(true);
  expect(mocks.preferences).toHaveBeenCalledExactlyOnceWith(user, false);
});

it.each(['en-IN', 'en-US', 'ur', 'fa-IR', null, 'arbitrary'])('renders English for saved %s without a notice translation', async language => {
  mocks.preferences.mockResolvedValue({ language });
  host.innerHTML = renderToString(await Page());
  expectNotice(false);
});

it('keeps English for a signed in user without a preferences row', async () => {
  mocks.preferences.mockResolvedValue(undefined);
  host.innerHTML = renderToString(await Page());
  expectNotice(false);
});

it('keeps the signed out default without reading preferences, even with a stale Arabic browser hint', async () => {
  mocks.session.mockResolvedValue(null);
  localStorage.setItem('groundwork-lang', 'ar-AE');
  try {
    host.innerHTML = renderToString(await Page());
    expectNotice(false);
    expect(mocks.preferences).not.toHaveBeenCalled();
  } finally {
    localStorage.clear();
  }
});

it.each(['ar-AE', 'en-IN'])('hydrates saved %s without changing the markup and lets the toggle override it', async language => {
  mocks.preferences.mockResolvedValue({ language });
  const page = await Page();
  host.innerHTML = renderToString(page);
  const serverHtml = host.innerHTML;
  const arabic = language === 'ar-AE';
  expectNotice(arabic);
  const recoverableError = vi.fn();
  await act(async () => { root = hydrateRoot(host, page, { onRecoverableError: recoverableError }); });
  expect(recoverableError).not.toHaveBeenCalled();
  expect(host.innerHTML).toBe(serverHtml);
  const buttons = host.querySelectorAll<HTMLButtonElement>('.privacy-notice button');
  await act(async () => buttons[arabic ? 0 : 1].click());
  expectNotice(!arabic);
  await act(async () => buttons[arabic ? 1 : 0].click());
  expectNotice(arabic);
  expect(mocks.preferences).toHaveBeenCalledTimes(1);
});
