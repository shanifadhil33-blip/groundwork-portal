// @vitest-environment jsdom
import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { chatText, DEMO_CHAT_COPY, DEMO_CHAT_STARTERS, DEMO_CHAT_WORDS, hidePhoneNumbers } from '../lib/ui/demo-chat';
import { LANGUAGES, isRtl } from '../lib/languages';
import { isEnglish } from '../lib/i18n';

const api = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../lib/ui/api', async original => ({ ...await original<typeof import('../lib/ui/api')>(), post: api.post }));
vi.mock('../components/app/context', async original => ({ ...await original<typeof import('../components/app/context')>(), useApp: () => ({ member: { role: 'admin', workspace_id: 'ws1' }, workspace: { is_demo: true }, me: { user: { id: 'u1' } } }) }));
import { DemoChat } from '../components/app/demo-chat';

const read = (code: string) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n', `${code}.json`), 'utf8')) as Record<string, string | null>;

describe('demo chat copy', () => {
  it('has no dashes, sparkles or phone numbers', () => {
    for (const w of DEMO_CHAT_WORDS) {
      expect(w, w).not.toMatch(/[-‐-―]/);
      expect(w, w).not.toMatch(/[✨✳✴❇]/);
      expect(hidePhoneNumbers(w), w).toBe(w);
    }
  });
  it('states that it is a simulation and not WhatsApp', () => {
    expect(DEMO_CHAT_COPY.label).toBe('Demo chat. This is a simulation using sample data. It is not connected to WhatsApp.');
    expect(DEMO_CHAT_COPY.name).toBe('Groundwork Agent');
    expect(DEMO_CHAT_STARTERS).toHaveLength(3);
  });
  it('is translated into Arabic with no dashes, and every language file has an entry', () => {
    const ar = read('ar-AE');
    for (const w of DEMO_CHAT_WORDS) {
      expect(ar[w], w).toMatch(/[؀-ۿ]/);
      expect(ar[w], w).not.toMatch(/[-‐-―]/);
    }
    for (const l of LANGUAGES.filter(l => !isEnglish(l.code))) for (const w of DEMO_CHAT_WORDS) expect(Object.hasOwn(read(l.code), w), `${l.code}: ${w}`).toBe(true);
    expect(isRtl('ar-AE')).toBe(true);
  });
  it('has a real translation in every language, with no dashes', () => {
    for (const l of LANGUAGES.filter(l => !isEnglish(l.code))) for (const w of DEMO_CHAT_WORDS) {
      const v = read(l.code)[w];
      expect(v, `${l.code}: ${w}`).toBeTruthy();
      expect(v, `${l.code}: ${w}`).not.toMatch(/[-‐-―]/);
    }
  });
  it('the English source inventory lists every sentence', () => {
    const source: string[] = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'i18n', 'english.json'), 'utf8'));
    for (const w of DEMO_CHAT_WORDS) expect(source).toContain(w);
  });
});

describe('demo chat text', () => {
  it('hides phone numbers but keeps dates and amounts', () => {
    expect(hidePhoneNumbers('Call +971 50 123 4567 now')).toBe('Call (number hidden) now');
    expect(hidePhoneNumbers('Call 050 123 4567')).toBe('Call (number hidden)');
    expect(hidePhoneNumbers('Due 2026.10.13 for AED 1,200.50, job 4521')).toBe('Due 2026.10.13 for AED 1,200.50, job 4521');
  });
  it('removes dashes from replies', () => {
    expect(chatText('Cooling – urgent — AC - unassigned')).not.toMatch(/[–—]| - /);
  });
});

describe('demo chat screen', () => {
  async function mount() {
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    Element.prototype.scrollIntoView = vi.fn();
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(<DemoChat />));
    return { host, done: async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); } };
  }
  it('shows the label, header and starter chips, and sends a tapped chip to the real assistant', async () => {
    api.post.mockResolvedValueOnce({ available: true, reply: 'Two jobs are overdue. Call 050 123 4567.' });
    const { host, done } = await mount();
    try {
      expect(host.textContent).toContain(DEMO_CHAT_COPY.label);
      expect(host.textContent).toContain('Groundwork Agent');
      const chip = [...host.querySelectorAll('button')].find(b => b.textContent === DEMO_CHAT_STARTERS[0])!;
      await act(async () => chip.click());
      expect(api.post.mock.calls[0][0]).toBe('/api/workspaces/ws1/assistant');
      expect(api.post.mock.calls[0][1].messages.at(-1)).toEqual({ role: 'user', content: DEMO_CHAT_STARTERS[0] });
      expect(host.querySelector('.bubble.out')?.textContent).toContain(DEMO_CHAT_STARTERS[0]);
      expect(host.querySelector('.bubble.in')?.textContent).toContain('Two jobs are overdue.');
      expect(host.textContent).not.toMatch(/050/);
    } finally { await done(); }
  });
  it('shows a friendly error with Try again, and retries', async () => {
    api.post.mockReset();
    api.post.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce({ available: true, reply: 'Done.' });
    const { host, done } = await mount();
    try {
      const chip = [...host.querySelectorAll('button')].find(b => b.textContent === DEMO_CHAT_STARTERS[1])!;
      await act(async () => chip.click());
      expect(host.textContent).toContain(DEMO_CHAT_COPY.errorTitle);
      expect(host.textContent).not.toContain('boom');
      await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === DEMO_CHAT_COPY.retry)!.click());
      expect(host.textContent).not.toContain(DEMO_CHAT_COPY.errorTitle);
      expect(host.querySelector('.bubble.in')?.textContent).toContain('Done.');
    } finally { await done(); }
  });
});
