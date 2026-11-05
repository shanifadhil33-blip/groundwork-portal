// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DemoPicker, personas } from '../components/public/demo-picker';
import { LANG_HINT_KEY } from '../lib/head-scripts';

const state = vi.hoisted(() => ({ postDemoStart: vi.fn() }));
vi.mock('../lib/ui/api', async original => ({ ...await original<typeof import('../lib/ui/api')>(), postDemoStart: state.postDemoStart }));
let host: HTMLDivElement, root: Root;
const replace = vi.fn();
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  localStorage.setItem(LANG_HINT_KEY, 'ar-AE');
  state.postDemoStart.mockResolvedValue({}); replace.mockClear();
  const browser = window;
  vi.stubGlobal('window', new Proxy(browser, { get(target, key) { return key === 'location' ? { replace } : Reflect.get(target, key); } }));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const homes = { imran: '/dashboard', hassan: '/dashboard', sam: '/dashboard', nabil: '/dashboard', ravi: '/today', pranav: '/home', omar: '/home', kevin: '/home', faisal: '/home' };
it.each(personas)('one click as $name ($role) starts the sandbox in the viewer language and lands on his home', async persona => {
  await act(async () => root.render(<DemoPicker />));
  const card = Array.from(host.querySelectorAll<HTMLButtonElement>('button.persona-card')).find(button => button.textContent?.includes(`Continue as ${persona.name}`));
  expect(card).toBeTruthy();
  expect(card!.textContent).toContain(persona.role);
  await act(async () => card!.click());
  expect(state.postDemoStart).toHaveBeenCalledExactlyOnceWith({ persona: persona.key, language: 'ar-AE' });
  expect(replace).toHaveBeenCalledExactlyOnceWith(homes[persona.key]);
});
