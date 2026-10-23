// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Greeting } from '../components/app/greeting';
import { setNotificationLanguage } from '../components/app/notification-language';
import { useNameJoin } from '../components/app/use-name-join';
import { LANGUAGES, languageOptions } from '../lib/languages';
import { readTranslationCache } from '../lib/i18n';
import { joinNames, NAME_JOIN } from '../lib/ui/name-joins';

const state = vi.hoisted(() => ({ first: 'Ravi Kumar', preferred: 'Ravi', asked: '2026-10-23' as string | null }));
vi.mock('../components/app/context', () => ({ useApp: () => ({ me: { user: { name: state.first } }, workspace: { timezone: 'UTC' } }) }));
vi.mock('../components/app/resource', () => ({ useResource: () => ({ data: { preferred_name: state.preferred, name_asked_at: state.asked } }) }));
const wordsFor = (code: string): Record<string, string> => code.startsWith('en') ? {} : readTranslationCache(readFileSync(`public/i18n/${code}.json`, 'utf8'), code);
const separator = (code: string) => ['ar-AE', 'ur', 'ps', 'fa-AF', 'fa-IR'].includes(code) ? '، ' : code === 'zh-CN' ? '，' : ['am', 'ti'].includes(code) ? '፣ ' : ', ';
let root: ReturnType<typeof createRoot> | undefined;
async function mount(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(node));
  return container;
}
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  setNotificationLanguage('', null);
  document.body.replaceChildren();
  vi.useRealTimers();
  state.first = 'Ravi Kumar'; state.preferred = 'Ravi'; state.asked = '2026-10-23';
});

describe('localized greetings and name joins', () => {
  it.each(LANGUAGES)('$code supplies punctuation for every greeting and name join', async ({ code }) => {
    const words = wordsFor(code), sep = separator(code);
    await act(async () => setNotificationLanguage(code, words));
    vi.useFakeTimers();
    const container = await mount(<Greeting tz="UTC" mode="title" />);
    for (const [hour, key] of [[8, 'Good morning'], [14, 'Good afternoon'], [20, 'Good evening']] as const) {
      vi.setSystemTime(new Date(`2026-10-23T${String(hour).padStart(2, '0')}:00:00Z`));
      for (const mode of ['title', 'both'] as const) {
        await act(async () => root!.render(<Greeting tz="UTC" mode={mode} />));
        expect(container.textContent).toBe(`${words[key] ?? key}${sep}Ravi`);
        expect(container.querySelector('bdi[data-no-translate]')?.textContent).toBe('Ravi');
        expect(container.querySelector(mode === 'title' ? 'h1' : 'p')).not.toBeNull();
      }
      if (!code.startsWith('en')) expect(words[`${key}, {name}`]).toBe(`${words[key]}${sep}{name}`);
    }
    if (!code.startsWith('en')) expect(words[NAME_JOIN]).toBe(`{first}${sep}{second}`);
    const join = (values: (string | null | undefined)[]) => joinNames(values, words);
    expect(join(['Ravi', null, 'Sample Court'])).toBe(`Ravi${sep}Sample Court`);
    expect(join(['Ravi', '+971000000000', 'Reception'])).toBe(`Ravi${sep}+971000000000${sep}Reception`);
    expect(join([null, 'Ravi'])).toBe('Ravi');
    expect(join([])).toBe('');
    const option = languageOptions(join).find(option => option.value === 'ar-AE')!;
    expect(option.label).toBe(`Gulf Arabic${sep}العربية الخليجية`);
  });

  it('updates an existing greeting and name join when the language changes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T20:00:00Z'));
    function Names() { const join = useNameJoin(); return <p data-no-translate>{join(['Ravi', 'Sample Court'])}</p>; }
    const container = await mount(<><Greeting tz="UTC" mode="title" /><Names /></>);
    expect(container.querySelector('h1')?.textContent).toBe('Good evening, Ravi');
    await act(async () => setNotificationLanguage('ar-AE', wordsFor('ar-AE')));
    expect(container.querySelector('h1')?.textContent).toBe('مساء الخير، Ravi');
    expect(container.querySelector('p')?.textContent).toBe('Ravi، Sample Court');
    await act(async () => setNotificationLanguage('en-GB', {}));
    expect(container.querySelector('h1')?.textContent).toBe('Good evening, Ravi');
    expect(container.querySelector('p')?.textContent).toBe('Ravi, Sample Court');
  });

  it('keeps names literal, supports reordered templates and omits punctuation when no name exists', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T20:00:00Z'));
    state.preferred = '<Ravi> $& {name}';
    await act(async () => setNotificationLanguage('ar-AE', { ...wordsFor('ar-AE'), 'Good evening, {name}': '{name}، مساء الخير' }));
    const container = await mount(<Greeting tz="UTC" mode="title" />);
    expect(container.textContent).toBe('<Ravi> $& {name}، مساء الخير');
    expect(container.querySelector('bdi')?.textContent).toBe(state.preferred);
    expect(container.querySelector('ravi')).toBeNull();
    expect(joinNames(['A {second} $&', 'B'], wordsFor('ar-AE'))).toBe('A {second} $&، B');
    state.preferred = ''; state.first = '';
    await act(async () => root!.render(<Greeting tz="UTC" mode="title" />));
    expect(container.textContent).toBe('مساء الخير');
    expect(container.querySelector('bdi')).toBeNull();
  });

  it('falls back to the first name and preserves the unanswered name prompt', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-23T20:00:00Z'));
    state.preferred = '';
    const container = await mount(<Greeting tz="UTC" />);
    expect(container.textContent).toBe('Good evening, Ravi');
    state.asked = null;
    await act(async () => root!.render(<Greeting tz="UTC" />));
    expect(container.textContent).toContain('What should I call you?');
    await act(async () => root!.render(<Greeting tz="UTC" mode="title" />));
    expect(container.textContent).toBe('Good evening, Ravi');
  });
});
