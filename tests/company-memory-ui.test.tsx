// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CompanyMemory } from '../components/app/company-memory';
import { Translator } from '../components/app/translator';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, readTranslationCache, TRANSLATION_ATTRIBUTES, TRANSLATION_SKIP, translationSource } from '../lib/i18n';
const state = vi.hoisted(() => ({ role: 'admin', staff_kind: null as string | null, language: 'en-IN', reload: vi.fn(), request: vi.fn(), loading: false, error: false, empty: false }));
const lesson = { id: 'rule', body: 'Original company instruction', recorded_by: 'Sam', created_at: '2026-10-23T08:00:00.000Z', context_uses: 3 };
vi.mock('../components/app/context', async original => ({ ...await original<typeof import('../components/app/context')>(), useApp: () => ({ member: { workspace_id: 'company', role: state.role, staff_kind: state.staff_kind } }) }));
vi.mock('../components/ui/lazy-dialog', () => import('../components/ui/dialog'));
vi.mock('../lib/ui/api', () => ({ request: (...args: unknown[]) => state.request(...args) }));
vi.mock('../components/app/resource', () => ({ useResource: (url: string | null) => React.useMemo(() => ({
  data: url === '/api/me/preferences' ? { language: state.language } : url?.endsWith('/lessons') ? { data: [], can_decide: state.role === 'admin' } : { data: state.empty ? [] : [lesson], can_edit: state.role === 'admin' },
  loading: state.loading, error: state.error ? new Error('Unavailable') : null, reload: state.reload,
}), [url, state.role, state.language, state.loading, state.error, state.empty]) }));
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  state.role = 'admin'; state.staff_kind = null; state.language = 'en-IN'; state.loading = false; state.error = false; state.empty = false;
  state.reload.mockReset(); state.request.mockReset(); state.request.mockResolvedValue({ status: 'waiting' });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); localStorage.clear(); });
async function render() { await act(async () => root.render(<CompanyMemory/>)); }
async function click(text: string, scope: ParentNode = document) {
  const button = Array.from(scope.querySelectorAll('button')).find(b => b.textContent === text);
  expect(button, text).toBeTruthy(); await act(async () => { button!.click(); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}

it('shows evidence and count, and submits a small correction through the approval path', async () => {
  await render();
  expect(host.textContent).toContain(lesson.body); expect(host.textContent).toContain('Recorded instruction'); expect(host.textContent).toContain('Sam'); expect(host.textContent).toContain('2026-10-23'); expect(host.querySelector('dd[data-no-translate]')?.textContent).toBe('3');
  expect(host.querySelector('[role="switch"]')).toBeNull();
  await click('Edit');
  const textarea = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Corrected company instruction');
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
  expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/company-memory/rule', { method: 'PATCH', body: JSON.stringify({ body: 'Corrected company instruction' }) });
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Correction waiting for approval. The old lesson is no longer used.'); expect(state.reload).toHaveBeenCalled();
});

it('requires a reviewable delete confirmation and shows failure without claiming success', async () => {
  await render(); await click('Delete', host);
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  expect(dialog.textContent).toContain(lesson.body); expect(state.request).not.toHaveBeenCalled();
  state.request.mockRejectedValueOnce(new Error('Unavailable'));
  await click('Delete', dialog);
  expect(dialog.querySelector('[role="alert"]')?.textContent).toBe('We couldn’t save that. Please try again.');
  expect(document.querySelector('[role="dialog"]')).toBeTruthy();
  await click('Delete', dialog);
  expect(state.request).toHaveBeenCalledWith('/api/workspaces/company/company-memory/rule', { method: 'DELETE' });
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(host.querySelector('[role="status"]')?.textContent).toBe('Lesson deleted. The next Agent plan will not use it.');
});

it('supervisors have no mutation buttons and other roles see the access message', async () => {
  state.role = 'staff'; await render();
  expect(host.textContent).toContain(lesson.body); expect(host.querySelector('button')).toBeNull();
  for (const [role, kind] of [['staff', 'office'], ['technician', null], ['client', null]]) {
    state.role = role!; state.staff_kind = kind; await render();
    expect(host.textContent).toContain('Company Memory is for owners, admins and supervisors.'); expect(host.textContent).not.toContain(lesson.body);
  }
});

it('ships usable words for every visible state in every app language', async () => {
  const keys = new Set<string>();
  function collect() {
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT); let node: Node | null;
    while ((node = walk.nextNode())) {
      const el = node instanceof Element ? node : node.parentElement;
      if (el?.closest(TRANSLATION_SKIP)) continue;
      if (node instanceof Text) { const key = translationSource(node.data); if (key) keys.add(key); }
      else if (node instanceof Element) for (const attr of TRANSLATION_ATTRIBUTES) { const key = translationSource(node.getAttribute(attr) ?? ''); if (key) keys.add(key); }
    }
  }
  await render(); collect(); await click('Edit'); collect(); await click('Cancel'); await click('Delete', host); collect(); await click('Delete', document.querySelector('[role="dialog"]')!); collect();
  for (const mode of ['loading', 'error', 'empty'] as const) { state[mode] = true; await render(); collect(); state[mode] = false; }
  state.role = 'staff'; await render(); collect(); state.staff_kind = 'office'; await render(); collect();
  for (const language of LANGUAGES.filter(l => !isEnglish(l.code))) {
    const dictionary = readTranslationCache(readFileSync(`public/i18n/${language.code}.json`, 'utf8'), language.code);
    for (const key of keys) {
      expect(dictionary[key], `${language.code}: ${key}`).toBeTruthy();
      expect(dictionary[key], `${language.code}: ${key}`).not.toBe(key);
      if (key.includes('Agent')) expect(dictionary[key], `${language.code}: ${key}`).not.toMatch(/\bAgent\b/);
    }
  }
});

it('uses Gulf Arabic and RTL while keeping authored evidence intact at a narrow viewport', async () => {
  state.language = 'ar-AE'; vi.stubGlobal('innerWidth', 360);
  const dictionary = readFileSync('public/i18n/ar-AE.json', 'utf8');
  const fetcher = vi.fn(async () => ({ ok: true, text: async () => dictionary, json: async () => ({ translations: {} }) })); vi.stubGlobal('fetch', fetcher);
  await act(async () => root.render(<><CompanyMemory/><Translator/></>));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
  expect(document.documentElement.dir).toBe('rtl'); expect(host.textContent).toContain('ذاكرة الشركة'); expect(host.textContent).toContain(lesson.body); expect(host.textContent).toContain('Sam');
  expect(host.textContent).toContain('الدروس اللي يستخدمها الوكيل لهالشركة.');
  expect(host.textContent).not.toContain('Agent');
  expect(fetcher.mock.calls).toHaveLength(1);
});
