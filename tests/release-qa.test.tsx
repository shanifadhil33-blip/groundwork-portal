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

it('lets the demo sentence wrap inside the demo bar', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  const rule = css.slice(css.indexOf('.demo-bar-who {')).split('}')[0];
  expect(rule).toContain('min-width: 0');
  expect(rule).not.toContain('nowrap');
});
