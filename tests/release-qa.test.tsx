// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { translationHostReady } from '../components/app/translator';

it('leaves server HTML alone until React has hydrated that host', () => {
  const heading = document.createElement('h1');
  heading.textContent = 'Settings';
  document.body.append(heading);
  const text = heading.firstChild!;
  expect(translationHostReady(text)).toBe(false);
  expect(translationHostReady(heading)).toBe(false);
  Object.defineProperty(heading, '__reactFiber$test', { value: {}, enumerable: true });
  expect(translationHostReady(text)).toBe(true);
  heading.remove();
});

it('lets the phone demo sentence wrap inside the banner', () => {
  const css = readFileSync('app/desert-stone.css', 'utf8');
  const mobile = css.slice(css.indexOf('@media(max-width:640px){body:has(.app-shell) .demo-banner{flex-wrap:wrap'));
  expect(mobile.startsWith('@media(max-width:640px)')).toBe(true);
  const rule = mobile.slice(0, mobile.indexOf('body:has(.app-shell) .notification-list'));
  expect(rule).toContain('white-space:normal');
  expect(rule).toContain('overflow-wrap:anywhere');
  expect(rule).not.toContain('width:1px');
  expect(rule).not.toContain('white-space:nowrap');
});

it('aligns the phone job search with the heading and gives the field the row', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const marker = '@media(max-width:720px){\n .app-main .work-list-page .page-header>.button{width:100%}';
  const phone = css.slice(css.indexOf(marker), css.indexOf(marker) + 500);
  expect(phone).toContain('.app-main .work-list-page .list-toolbar{padding:0;');
  expect(phone).toContain('.search-control{flex:1 1 100%;min-width:0;max-width:none}');
});
