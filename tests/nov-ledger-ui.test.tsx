// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { EnglishCopy, FullDoneCard, JobCloseView, type CloseState } from '../components/app/job-close';

const state = (extra: Partial<CloseState> = {}): CloseState => ({
  can_sign_off: true, signed_off: false, can_mark: true, marked: false,
  photos: { before: 0, after: 1, total: 1 },
  draft: { lines: [{ label: 'Work reported', detail: 'Changed the washer', amount: '150.00' }, { label: 'Part reported', detail: 'Mystery motor', amount: null }], status: 'waiting', cost: null, can_keep: true, waiting: 'Waiting for the owner' },
  card: { problem: 'Tap leaking', fix: 'Changed the washer', outcome: 'Fixed', technician: 'Ravi', when: null, cost: null, waiting: 'Waiting for the owner', thanks: null },
  ...extra,
});

it('shows the full job done card and the client sign off', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const clicks: string[] = [];
  await act(async () => { root.render(<>
    <FullDoneCard outcome="needs_part" name="Ravi" problem="Tap leaking" work="Checked the pump" before={0} after={1} onClose={() => clicks.push('close')} />
    <JobCloseView state={state()} currency="AED" busy={false} error="" onSign={() => clicks.push('sign')} onMark={() => clicks.push('mark')} onKeep={() => clicks.push('keep')} />
    <EnglishCopy language="hi" text="Checked the pump" />
    <EnglishCopy language="en" text="Checked the pump" />
  </>); });
  expect(host.textContent).toContain('Report saved. The job waits for the part.');
  expect(host.textContent).toContain('Ravi');
  expect(host.textContent).toContain('Tap leaking');
  expect(host.textContent).toContain('Needs a part');
  expect(host.textContent).toContain('No photos');
  expect(host.textContent).toContain('Sign off');
  expect(host.textContent).toContain('Mystery motor');
  expect(host.textContent).toContain('Waiting for the owner');
  expect(host.textContent).toContain('Translated');
  expect(host.textContent?.match(/Translated/g)).toHaveLength(1);
  const sign = [...host.querySelectorAll('button')].find(b => b.textContent === 'Sign off');
  expect(sign && getComputedStyle(sign).minHeight).not.toBe('0px');
  await act(async () => { sign?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(clicks).toContain('sign');
  root.unmount();
});
