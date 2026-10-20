// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { JobCloseView, type CloseState } from '../components/app/job-close';
import { DayPlanView, type DayPlanData } from '../components/app/day-plan-card';
import { HabitView } from '../components/app/habits';

const state = (): CloseState => ({
  can_sign_off: true, signed_off: false, can_mark: false, marked: false,
  photos: { before: 1, after: 1, total: 2 },
  draft: { lines: [{ label: 'Work reported', detail: 'Mystery motor', amount: '150.00' }], status: 'waiting', cost: '150.00', can_keep: true, waiting: 'Waiting for the owner' },
  card: { problem: 'Tap leaking', fix: 'Changed the washer', outcome: 'Fixed', technician: 'Ravi', when: null, cost: '150.00', waiting: null, thanks: null, shown_label: 'Visit charge', shown_amount: 'AED 150.00' },
});

const plan: DayPlanData = {
  can_plan: true, demo: true, summary: '1 of 1 open jobs can be placed. Nothing is saved until you say yes.', fingerprint: 'fp',
  lines: [{ job_id: 'j', order: 4, title: 'Tap', assignee_id: 'ravi', assignee_name: 'Ravi', hour: 9, window: '9 AM to 11 AM', why: 'Ravi covers this trade.', kind: 'place' }],
  watch: [], gates: [{ id: 'g', order: 5, title: 'Gate', window: '9 AM to 11 AM' }], visits: [{ id: 'v', order: 6, title: 'Late visit' }],
  people: [{ id: 'ravi', name: 'Ravi', away: null }],
};

it('lets the client sign off in one tap and hides the draft bill', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => { root.render(<JobCloseView state={state()} currency="AED" busy={false} error="" client stars={4} thanks="" onSign={() => undefined} onMark={() => undefined} onKeep={() => undefined} />); });
  expect(host.textContent).toContain('A short thank you');
  expect(host.textContent).toContain('Sign off');
  expect(host.textContent).toContain('Visit charge');
  expect(host.textContent).toContain('AED 150.00');
  expect(host.textContent).not.toContain('Mystery motor');
  expect(host.textContent).not.toContain('Draft bill');
  const star = host.querySelector('.rating-pick button');
  expect(star && getComputedStyle(star).minHeight).not.toBe('0px');
  root.unmount();
});

it('shows the day plan full width with a yes button', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const clicks: string[] = [];
  await act(async () => { root.render(<DayPlanView data={plan} busy="" error="" notice="" onApprove={kind => clicks.push(kind)} onGate={() => undefined} onLate={() => undefined} onPreview={() => undefined} />); });
  expect(host.querySelector('.day-plan')).toBeTruthy();
  expect(host.textContent).toContain('9 AM to 11 AM');
  expect(host.textContent).toContain('No message is sent');
  const yes = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Approve this plan'));
  await act(async () => { yes?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(clicks).toEqual(['morning']);
  root.unmount();
});

it('shows a habit only as a suggestion', async () => {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const areas: string[] = [];
  await act(async () => { root.render(<HabitView suggestions={[{ id: 'area:Marina', text: 'Remember this area', area: 'Marina' }]} busy={false} notice="" error="" onRemember={area => areas.push(area)} />); });
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Remember');
  await act(async () => { button?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  expect(areas).toEqual(['Marina']);
  root.unmount();
});
