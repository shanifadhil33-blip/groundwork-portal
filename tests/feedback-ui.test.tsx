// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ post: vi.fn(), person: 'imran', sandbox: 'one', demo: true }));
vi.mock('../components/app/context', () => ({ useApp: () => ({ me: { user: { id: mocks.person, is_demo: mocks.demo } }, workspace: { id: mocks.sandbox } }) }));
vi.mock('../lib/ui/api', async original => ({ ...await original<object>(), post: mocks.post }));
vi.mock('../components/ui', () => ({ Button: ({ children, busy, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) => <button {...props}>{children}</button> }));
import { HelpFeedback } from '../components/app/help-feedback';
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  vi.resetAllMocks(); mocks.person = 'imran'; mocks.sandbox = 'one'; mocks.demo = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const render = () => act(async () => root.render(<HelpFeedback />));
async function write(text: string) {
  const field = host.querySelector('textarea')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(field, text);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function click(label: string) {
  await act(async () => [...host.querySelectorAll('button')].find(b => b.textContent === label)!.click());
}
async function attach() {
  vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 12, height: 12 }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as any);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,cGljdHVyZQ==');
  const input = host.querySelector('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [new File(['picture'], 'picture.png', { type: 'image/png' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}
it('shows a local receipt with the submitted message and picture, then clears it', async () => {
  mocks.post.mockResolvedValue({ ok: true, simulated: true });
  await render(); await write('Please add a calendar'); await attach(); await click('Send');
  expect(host.textContent).toContain('Demo feedback saved here; nothing was sent');
  expect(host.querySelector('[data-no-translate]')?.textContent).toBe('Please add a calendar');
  expect(host.querySelector('img')?.src).toBe('data:image/jpeg;base64,cGljdHVyZQ==');
  expect(mocks.post.mock.calls[0][1].screenshot).toEqual({ type: 'image/jpeg', data: 'cGljdHVyZQ==' });
  await click('Send another');
  expect(host.querySelector('textarea')?.value).toBe(''); expect(host.querySelector('img')).toBeNull();
});
it('preserves the real thank you without a simulated receipt', async () => {
  mocks.demo = false; mocks.post.mockResolvedValue({ ok: true });
  await render(); expect(host.textContent).toContain('We read every message.');
  await write('Please add a calendar'); await click('Send');
  expect(host.textContent).toContain('We got your message.');
  expect(host.textContent).not.toContain('nothing was sent'); expect(host.querySelector('[data-no-translate]')).toBeNull();
});
it('clears drafts and pictures when changing persona, sandbox or reopening', async () => {
  await render(); await write('Private draft'); await attach();
  mocks.person = 'faisal'; await render();
  expect(host.querySelector('textarea')?.value).toBe(''); expect(host.querySelector('img')).toBeNull();
  await write('Another private draft'); mocks.sandbox = 'two'; await render();
  expect(host.querySelector('textarea')?.value).toBe('');
  await write('Closing draft'); await act(async () => root.render(null)); await render();
  expect(host.querySelector('textarea')?.value).toBe('');
});
it('does not reveal a receipt to a new persona when an old submission finishes', async () => {
  let finish!: (result: unknown) => void;
  mocks.post.mockReturnValue(new Promise(resolve => { finish = resolve; }));
  await render(); await write('Private submission'); await click('Send');
  mocks.person = 'faisal'; await render();
  await act(async () => finish({ ok: true, simulated: true }));
  expect(host.textContent).not.toContain('Private submission'); expect(host.textContent).not.toContain('nothing was sent');
});
it('keeps the draft when submission fails and rejects a short message locally', async () => {
  await render(); await write('a'); await click('Send'); expect(mocks.post).not.toHaveBeenCalled();
  mocks.post.mockRejectedValue(new Error('Failed'));
  await write('Please add a calendar'); await click('Send');
  expect(host.querySelector('textarea')?.value).toBe('Please add a calendar');
  expect(host.querySelector('[role=alert]')).not.toBeNull();
});

it.each(['person', 'sandbox'] as const)('clears a saved receipt when the %s changes', async scope => {
  mocks.post.mockResolvedValue({ ok: true, simulated: true });
  await render(); await write('Private saved message'); await attach(); await click('Send');
  expect(host.textContent).toContain('Private saved message');
  if (scope === 'person') mocks.person = 'faisal';
  else mocks.sandbox = 'two';
  await render();
  expect(host.textContent).not.toContain('Private saved message');
  expect(host.querySelector('textarea')?.value).toBe('');
  expect(host.querySelector('img')).toBeNull();
});
