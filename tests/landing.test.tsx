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

import { FRAME_COUNT, SEQ_START, fitFrame, phoneAnchor, frameIndex, frameSrc, loadOrder, nearestLoaded, phoneCurve, phoneProgress, easeToward, blendFrames, frameFloat } from '../lib/landing/sequence';
describe('pre-rendered building sequence for phones', () => {
  it('server renders a dimensioned first-frame poster and the canvas', () => {
    const html = renderToStaticMarkup(<Landing />);
    expect(html).toMatch(/<picture><source type="image\/avif" srcSet="\/landing\/seq\/f000\.avif"\/><img class="lx-seq-poster" src="\/landing\/seq\/f000\.webp" width="900" height="1250" alt=""/);
  });
  it('ships every frame within the byte budget', () => {
    for (const [format, each, budget] of [['avif', 25_000, 1_500_000], ['webp', 30_000, 2_000_000]] as const) {
      let total = 0;
      for (let i = 0; i < FRAME_COUNT; i++) {
        const size = statSync(new URL(`../public${frameSrc(i, format)}`, import.meta.url)).size;
        expect(size).toBeLessThanOrEqual(each); total += size;
      }
      expect(total).toBeLessThanOrEqual(budget);
    }
  });
  it('maps progress to frames and falls back to the nearest loaded frame', () => {
    expect(frameIndex(0)).toBe(0); expect(frameIndex(SEQ_START)).toBe(0); expect(frameIndex(1)).toBe(119); expect([59, 60]).toContain(frameIndex(SEQ_START + (1 - SEQ_START) / 2)); expect(frameIndex(2)).toBe(119);
    const loaded = new Array(120).fill(false); expect(nearestLoaded(50, loaded)).toBe(-1);
    loaded[0] = loaded[56] = true; expect(nearestLoaded(50, loaded)).toBe(56); expect(nearestLoaded(20, loaded)).toBe(0);
    loaded[44] = true; expect(nearestLoaded(50, loaded)).toBe(44);
  });
  it('loads coarse to fine and covers every frame once', () => {
    const order = loadOrder(); expect(order.slice(0, 3)).toEqual([0, 119, 8]);
    expect(new Set(order).size).toBe(120); expect(order).toHaveLength(120);
  });
  it('maps phone scroll through one continuous, strictly rising curve with no holds', () => {
    expect(phoneCurve(0)).toBe(0); expect(phoneCurve(1)).toBe(1);
    let previous = -1, minSlope = Infinity;
    for (let i = 0; i <= 1000; i++) {
      const value = phoneCurve(i / 1000);
      expect(value).toBeGreaterThan(previous);
      if (i) minSlope = Math.min(minSlope, (value - previous) * 1000);
      previous = value;
    }
    expect(minSlope).toBeGreaterThanOrEqual(.25);
    expect(phoneProgress(0, 1000)).toBeCloseTo(SEQ_START); expect(phoneProgress(1000, 1000)).toBe(1); expect(phoneProgress(5000, 1000)).toBe(1);
    expect(frameFloat(phoneProgress(500, 1000))).toBeCloseTo(119 * (.125 + .75 * Math.pow(.5, 2.2)));
  });
  it('eases toward the target and crossfades neighbouring frames', () => {
    expect(easeToward(0, 10, .15)).toBeCloseTo(1.5); expect(easeToward(9.99, 10)).toBe(10);
    let p = 0; for (let i = 0; i < 60; i++) p = easeToward(p, 10); expect(p).toBe(10);
    const loaded = new Array(120).fill(false); expect(blendFrames(10.4, loaded)).toBeNull();
    loaded[10] = loaded[11] = true; expect(blendFrames(10.4, loaded)).toEqual({ base: 10, over: 11, mix: expect.closeTo(.4) });
    loaded[11] = false; expect(blendFrames(10.6, loaded)).toEqual({ base: 10, over: 10, mix: 0 });
    loaded[119] = true; expect(blendFrames(119, loaded)).toEqual({ base: 119, over: 119, mix: 0 });
  });
  it('tilts the phone framing from low to centred as the building rises', () => {
    expect(phoneAnchor(0)).toBe(.95); expect(phoneAnchor(40)).toBeCloseTo(.5); expect(phoneAnchor(119)).toBeCloseTo(.5);
  });
  it('fits frames as cover or contain', () => {
    expect(fitFrame(900, 1250, 'cover')).toEqual({ x: 0, y: 0, width: 900, height: 1250 });
    const cover = fitFrame(390, 400, 'cover', .55); expect(cover.width).toBe(390); expect(cover.height).toBeGreaterThan(400);
    const inset = fitFrame(390, 439, 'cover', .5, 24); expect(inset.y).toBeCloseTo(24 + (415 - inset.height) / 2); expect(inset.width).toBe(390);
    const contain = fitFrame(1400, 1250, 'contain'); expect(contain.height).toBe(1250); expect(contain.x).toBe(250);
  });
});

it('labels the key with the colours the 3D bands actually use', () => {
  const css = readFileSync(new URL('../components/landing/landing.css', import.meta.url), 'utf8');
  const scene = readFileSync(new URL('../components/landing/scene.ts', import.meta.url), 'utf8');
  expect(scene).toContain('0x89a9b0'); expect(scene).toContain('0xc69753');
  expect(css).toMatch(/\.lx-scheduled\{background:#89a9b0\}/); expect(css).toMatch(/\.lx-done\{background:#c69753\}/);
  expect(css).toMatch(/\.lx-open\{background:#292929/);
});

describe('phone path', () => {
  it('follows one curve: page speed at the start, a smooth near stop, page speed again, never a jump or push', async () => {
    const { phonePath, phoneFade } = await import('../lib/landing/sequence');
    for (const [range, travel] of [[1035, 335], [990, 300]]) {
      const path = phonePath(range, travel);
      expect(path.velocity(0)).toBeCloseTo(-1, 6);
      expect(path.velocity(1.3)).toBeCloseTo(-1, 6);
      let last = path.velocity(0), maxChange = 0, prevTop = path.offset(0);
      for (let i = 1; i <= 1600; i++) {
        const p = i / 1000, v = path.velocity(p), top = path.offset(p);
        // Always moving up (never stops), never faster than the page, and velocity changes gradually.
        expect(v).toBeLessThan(0); expect(v).toBeGreaterThanOrEqual(-1 - 1e-9);
        expect(top).toBeLessThan(prevTop);
        maxChange = Math.max(maxChange, Math.abs(v - last)); last = v; prevTop = top;
      }
      expect(maxChange).toBeLessThan(.01);
      // Settles about `travel` px up once the slowdown is done.
      expect(Math.abs(-path.offset(path.rampTo) - travel)).toBeLessThan(6);
    }
    expect(phoneFade(.5)).toBe(1); expect(phoneFade(.95)).toBeCloseTo(0, 9);
  });
});
