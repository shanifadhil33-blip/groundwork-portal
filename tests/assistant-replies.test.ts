import { expect, it } from 'vitest';
import { actionSummary, audienceStatusReply, plainAssistantReply } from '../lib/ui/assistant-replies';

it.each([false, true])('preserves ordinary prose for client=%s', client => {
 const sentences = [
  'The visit is not scheduled yet',
  'Please keep the gate open until the work is done.',
  'This is normal with high pressure and low flow.',
  'It is urgent because the visit was cancelled.',
  'Done, Kevin. The visit is not scheduled yet.',
  'Done. The work is done.',
 ];
 for (const sentence of sentences) {
  expect(audienceStatusReply(sentence, client)).toBe(sentence);
  expect(plainAssistantReply(sentence, client)).toBe(sentence);
 }
});

it.each([false, true])('translates machine statuses and explicit status labels for client=%s', client => {
 const scheduled = client ? 'Visit Scheduled' : 'Scheduled';
 const done = client ? 'Completed' : 'Done';
 const open = client ? 'Request Received' : 'Open';
 const progress = client ? 'Work in Progress' : 'In Progress';
 for (const format of [audienceStatusReply, plainAssistantReply]) {
  expect(format('in_progress; waiting_on_parts', client)).toBe(`${progress}; Waiting on Parts`);
  expect(format('Scheduled; Done; Open', client)).toBe(`${scheduled}; ${done}; ${open}`);
  expect(format('Status: scheduled. The status is done. Status: open.', client)).toBe(`Status: ${scheduled}. The status is ${done}. Status: ${open}.`);
  expect(format('Status: Visit Scheduled. Status: Completed.', client)).toBe(`Status: ${scheduled}. Status: ${done}.`);
 }
});

it('includes the chosen visit window in the request confirmation text shown to a client', () => {
 const summary = actionSummary('create_request', {
  title: 'Repair cooling', description: 'The visit is not scheduled yet',
  preferred_window: 'Saturday after 4 PM',
 }, null, 'Home');
 const cardText = plainAssistantReply(audienceStatusReply(summary, true), true);
 expect(cardText).toContain('\nBest time for the visit: Saturday after 4 PM\n');
 expect(cardText).toContain('The visit is not scheduled yet');
 expect(cardText).not.toMatch(/[-–—]/);
 expect(actionSummary('create_request', { description:'Water is dripping and needs a look',title: 'Repair cooling' })).not.toContain('Best time for the visit:');
});
