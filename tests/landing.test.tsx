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
  expect(footer).toContain('Portfolio project with fictional data.');
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
