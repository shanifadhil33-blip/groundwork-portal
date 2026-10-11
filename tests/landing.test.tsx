import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import Landing from '../app/page';
import { shouldUse3D, type LandingCapabilities } from '../lib/landing/capabilities';
it('renders accessible landing copy, hero and reveal actions, and legal footer on the server', () => {
  const html = renderToStaticMarkup(<Landing />);
  expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
  for (const section of ['lx-hero', 'lx-finale']) {
    const content = html.split(`<section class="${section}"`)[1].split('</section>')[0];
    expect(content).toContain('href="/demo"'); expect(content).toContain('href="/sign-in"');
  }
  const footer = html.split('<footer')[1];
  expect(footer).toContain('href="/privacy"'); expect(footer).toContain('href="/terms"');
  expect(footer).not.toMatch(/portfolio|fictional/i);
  expect(html).toContain('lx-building'); expect(html).toContain('Skip to content');
  expect(html).not.toMatch(/Sparkles|✨|🚀/i);
});
const desktop: LandingCapabilities = { reducedMotion: false, smallScreen: false, coarsePointer: false, hardwareConcurrency: 8, deviceMemory: 8, saveData: false, webgl: true };
describe('3D eligibility', () => {
  it('allows capable desktops including browsers without optional memory hints', () => {
    expect(shouldUse3D(desktop)).toBe(true);
    expect(shouldUse3D({ ...desktop, deviceMemory: undefined, hardwareConcurrency: undefined })).toBe(true);
  });
  it.each([
    { reducedMotion: true }, { smallScreen: true }, { coarsePointer: true },
    { hardwareConcurrency: 4 }, { deviceMemory: 4 }, { saveData: true }, { webgl: false },
  ])('keeps the SVG fallback for %j', hint => expect(shouldUse3D({ ...desktop, ...hint })).toBe(false));
});

// These tests are intentionally independent of the portal/database.
import { readFileSync, statSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { buildingFrame, DEFAULT_HERO, heroBootstrap, selectHero, shouldLoadHeroVideo } from '../lib/landing/hero';

describe('static hero variants', () => {
  it.each([
    ['', DEFAULT_HERO], ['?hero=code', 'code'], ['?hero=media', 'media'],
    ['?utm_source=test&hero=media', 'media'], ['?hero=unknown', DEFAULT_HERO],
    ['?hero=%3Cscript%3E', DEFAULT_HERO],
  ])('selects %s on the client, including the before-paint bootstrap', (search, expected) => {
    expect(selectHero(search)).toBe(expected);
    const root = { dataset: { hero: DEFAULT_HERO } };
    runInNewContext(heroBootstrap, { document: { currentScript: { parentElement: root } }, location: { search }, URLSearchParams });
    expect(root.dataset.hero).toBe(expected);
  });
  it('keeps the route server rendered with one illustration and all sections in order', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toContain(`data-hero="${DEFAULT_HERO}"`);
    expect(html.match(/class="lx-building"/g)).toHaveLength(1);
    expect(html.match(/class="lx-floor"/g)).toHaveLength(9);
    const copy = ['Run every work order', 'A request becomes a plan.', 'Requests come in', 'Your team schedules and works them', 'Clients see progress', 'Your AI agents can work here too.', 'Every job,', 'Privacy'];
    const positions = copy.map(text => html.indexOf(text));
    expect(positions.every(index => index >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    const page = readFileSync(new URL('../app/page.tsx', import.meta.url), 'utf8');
    expect(page).not.toMatch(/searchParams|useSearchParams/);
  });
  it('renders dimensioned responsive posters and defers every video source', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toMatch(/<img[^>]*width="1600"[^>]*height="1066"[^>]*alt=""/);
    expect(html).toContain('/landing/building-800.webp 800w, /landing/building-1600.webp 1600w');
    expect(html).toMatch(/<video[^>]*width="1280"[^>]*height="854"[^>]*muted=""[^>]*playsInline=""[^>]*preload="none"[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/<source[^>]*\ssrc=/);
    expect(html).not.toContain('/landing/src/');
    for (const width of [720, 1280]) for (const format of ['mp4', 'webm']) {
      const path = `/landing/building-${width}.${format}`;
      expect(html).toContain(`data-src="${path}"`);
      expect(statSync(new URL(`../public${path}`, import.meta.url)).size).toBeLessThanOrEqual(900_000);
    }
    for (const width of [800, 1600]) {
      expect(statSync(new URL(`../public/landing/building-${width}.webp`, import.meta.url)).size).toBeLessThanOrEqual(120_000);
    }
  });
});

describe('scroll and motion fallbacks', () => {
  it('assembles bottom to top, then lights Open → Scheduled → Done', () => {
    expect(buildingFrame(.4, 0, 0, false).rise).toBe(1);
    expect(buildingFrame(.4, 0, 8, false).rise).toBe(0);
    for (let floor = 0; floor < 9; floor++) {
      expect(buildingFrame(1, 1, floor, false)).toEqual({ rise: 1, open: 1, scheduled: 0, done: 0 });
      expect(buildingFrame(1, 2, floor, false)).toEqual({ rise: 1, open: 1, scheduled: 1, done: 0 });
      expect(buildingFrame(1, 3, floor, false)).toEqual({ rise: 1, open: 1, scheduled: 1, done: 1 });
      expect(buildingFrame(0, 0, floor, true)).toEqual({ rise: 1, open: 1, scheduled: 1, done: 1 });
    }
  });
  it('loads media only near the viewport, with motion allowed and data saving off', () => {
    expect(shouldLoadHeroVideo('media', false, false, true)).toBe(true);
    expect(shouldLoadHeroVideo('code', false, false, true)).toBe(false);
    expect(shouldLoadHeroVideo('media', true, false, true)).toBe(false);
    expect(shouldLoadHeroVideo('media', false, true, true)).toBe(false);
    expect(shouldLoadHeroVideo('media', false, false, false)).toBe(false);
  });
});

it('positions the product as real: no portfolio or fictional wording on public pages and no scroll cue', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['app/page.tsx', 'app/(public)/privacy/page.tsx', 'app/(public)/terms/page.tsx', 'app/(public)/sign-in/page.tsx', 'components/public/chrome.tsx']) {
    const src = readFileSync(f, 'utf8');
    expect(src, f).not.toMatch(/portfolio|fictional/i);
  }
  expect(readFileSync('app/page.tsx', 'utf8')).not.toContain('lx-scroll');
});
