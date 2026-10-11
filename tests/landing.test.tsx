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
  expect(html).toContain('lx-seq-poster'); expect(html).toContain('Skip to content');
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
import { DEFAULT_HERO, heroBootstrap, selectHero, shouldLoadHeroVideo } from '../lib/landing/hero';

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
    expect(html.match(/class="lx-seq-poster"/g)).toHaveLength(1);
    expect(html.match(/class="lx-seq-canvas"/g)).toHaveLength(1);
    expect(html).not.toMatch(/lx-building|lx-floor|<svg[^>]*viewBox="90 70/);
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

import { FRAME_COUNT, fitFrame, frameIndex, frameSrc, loadOrder, nearestLoaded, PHONE_KEYFRAMES, piecewise } from '../lib/landing/sequence';
describe('pre-rendered building sequence for phones', () => {
  it('server renders a dimensioned first-frame poster and the canvas', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toMatch(/<img class="lx-seq-poster" src="\/landing\/seq\/f000\.webp" width="600" height="833" alt=""/);
  });
  it('ships every frame within the byte budget', () => {
    let total = 0;
    for (let i = 0; i < FRAME_COUNT; i++) {
      const size = statSync(new URL(`../public${frameSrc(i)}`, import.meta.url)).size;
      expect(size).toBeLessThanOrEqual(40_000); total += size;
    }
    expect(total).toBeLessThanOrEqual(1_600_000);
  });
  it('maps progress to frames and falls back to the nearest loaded frame', () => {
    expect(frameIndex(0)).toBe(0); expect(frameIndex(1)).toBe(119); expect(frameIndex(.5)).toBe(60); expect(frameIndex(2)).toBe(119);
    const loaded = new Array(120).fill(false); expect(nearestLoaded(50, loaded)).toBe(-1);
    loaded[0] = loaded[56] = true; expect(nearestLoaded(50, loaded)).toBe(56); expect(nearestLoaded(20, loaded)).toBe(0);
    loaded[44] = true; expect(nearestLoaded(50, loaded)).toBe(44);
  });
  it('loads coarse to fine and covers every frame once', () => {
    const order = loadOrder(); expect(order.slice(0, 3)).toEqual([0, 119, 8]);
    expect(new Set(order).size).toBe(120); expect(order).toHaveLength(120);
  });
  it('paces the phone animation through the copy keyframes', () => {
    const xs = [0, 200, 400, 600, 800, 1000], ys = [0, ...PHONE_KEYFRAMES, 1];
    expect(piecewise(-50, xs, ys)).toBe(0); expect(piecewise(200, xs, ys)).toBe(.3); expect(piecewise(100, xs, ys)).toBeCloseTo(.15);
    expect(piecewise(5000, xs, ys)).toBe(1);
    expect(piecewise(300, [0, 400, 300, 1000], [0, .5, .6, 1])).toBeCloseTo(.375);
    expect([...PHONE_KEYFRAMES]).toEqual([...PHONE_KEYFRAMES].sort());
  });
  it('fits frames as cover or contain', () => {
    expect(fitFrame(600, 833, 'cover')).toEqual({ x: 0, y: 0, width: 600, height: 833 });
    const cover = fitFrame(390, 400, 'cover', .55); expect(cover.width).toBe(390); expect(cover.height).toBeGreaterThan(400);
    const contain = fitFrame(1000, 833, 'contain'); expect(contain.height).toBe(833); expect(contain.x).toBe(200);
  });
});
