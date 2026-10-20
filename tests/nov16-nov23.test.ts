import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DAY_REPLIES, arrivalWindow, canConfirmGate, canPlanDay, disclosedCost, morningPlan, planFingerprint, planSavedReply,
  readOnTheWay, readPlanApprove, readPlanAsk, sickMove, urgentReshuffle, watchLate, type PlanJob, type PlanPerson,
} from '../lib/day-plan';
import { LEARN_REPLIES, classifyCorrection, habitSuggestions } from '../lib/learn-habits';
import { ARCHIVE_REPLIES, contractChoice, documentChoice, supplierChoice } from '../lib/record-archive';
import { rightScript, validTranslation } from '../lib/i18n';

const ravi: PlanPerson = { id: 'ravi', name: 'Ravi', trades: ['plumbing'], areas: ['Marina'], away: null, booked: [] };
const bilal: PlanPerson = { id: 'bilal', name: 'Bilal', trades: ['plumbing'], areas: [], away: 'Bilal is off sick that day.', booked: [8] };
const job = (extra: Partial<PlanJob>): PlanJob => ({ id: 'j1', order: 12, title: 'Tap', trade: 'plumbing', area: 'Marina', priority: 'normal', status: 'open', assignee_id: null, hour: null, ...extra });

describe('arrival windows', () => {
  it('promises a two hour window and never an exact minute', () => {
    expect(arrivalWindow(9)).toEqual({ start: 9, end: 11, label: '9 AM to 11 AM' });
    expect(arrivalWindow(19).label).toBe('7 PM to 8 PM');
    expect(arrivalWindow(3).label).toBe('6 AM to 8 AM');
    expect(arrivalWindow(9).label).not.toMatch(/:/);
  });
});

describe('morning plan and the day', () => {
  it('skips someone who is away and will not save until yes', () => {
    const plan = morningPlan([job({ id: 'a', order: 1 }), job({ id: 'b', order: 2, trade: 'electrical' })], [ravi, bilal]);
    expect(plan.lines[0]).toMatchObject({ assignee_name: 'Ravi', hour: 8, kind: 'place' });
    expect(plan.lines[1].kind).toBe('flag');
    expect(plan.summary).toMatch(/Nothing is saved until you say yes/);
    expect(plan.lines.map(line => line.assignee_id)).not.toContain('bilal');
  });
  it('offers a later window and says nothing is sent', () => {
    const line = watchLate(job({ status: 'scheduled', assignee_id: 'ravi', hour: 9, running_late: true }), [ravi, { ...bilal, away: null, booked: [] }]);
    expect(line?.window).toBe('11 AM to 1 PM');
    expect(line?.why).toMatch(/Nothing is sent until you say yes/);
    expect(line?.why).not.toMatch(/sent a message|whatsapp|sms/i);
  });
  it('moves a visit so an urgent call can come first', () => {
    const urgent = job({ id: 'u', status: 'open', priority: 'urgent' });
    const held = job({ id: 'h', status: 'scheduled', assignee_id: 'ravi', hour: 8 });
    const lines = urgentReshuffle(urgent, [urgent, held], [ravi]).lines;
    expect(lines[0]).toMatchObject({ job_id: 'u', hour: 8, assignee_id: 'ravi' });
    expect(lines[1].job_id).toBe('h');
  });
  it('moves a sick technician off his visits', () => {
    const moved = sickMove('ravi', [job({ status: 'scheduled', assignee_id: 'ravi', hour: 10 })], [ravi, { ...bilal, away: null, booked: [] }]);
    expect(moved.lines[0].assignee_id).toBe('bilal');
    expect(moved.summary).toMatch(/Nothing moves until you say yes/);
  });
  it('changes the fingerprint when the day changes', () => {
    const first = morningPlan([job({})], [ravi]);
    const second = morningPlan([job({})], [{ ...ravi, booked: [8] }]);
    expect(planFingerprint(first.lines)).not.toBe(planFingerprint(second.lines));
    expect(planSavedReply(0)).toMatch(/No phone notification went out/);
    expect(planSavedReply(2)).toMatch(/Phone notifications went to the people who turned them on/);
    expect(planSavedReply(0)).not.toMatch(/sent a message/i);
  });
});

describe('who may plan, confirm a gate, or see a price', () => {
  const actor = { user: 'sam', client_id: 'client' };
  it('lets the owner and a supervisor approve, and keeps office staff from approving', () => {
    expect(canPlanDay({ ...actor, role: 'admin' })).toBe(true);
    expect(canPlanDay({ ...actor, role: 'staff', staff_kind: null })).toBe(true);
    expect(canPlanDay({ ...actor, role: 'staff', staff_kind: 'office' })).toBe(false);
    expect(canPlanDay({ ...actor, role: 'technician' })).toBe(false);
  });
  it('lets a household confirm only his own visit', () => {
    const visit = { client_id: 'client', created_by: 'home' };
    expect(canConfirmGate({ ...actor, role: 'client', client_kind: 'household', user: 'home' }, visit)).toBe(true);
    expect(canConfirmGate({ ...actor, role: 'client', client_kind: 'household', user: 'other' }, visit)).toBe(false);
    expect(canConfirmGate({ ...actor, role: 'technician', user: 'ravi' }, visit)).toBe(false);
  });
  it('shows a price the client was already told, and never a draft or a technician price', () => {
    expect(disclosedCost('technician', { payment_status: 'contract', quote_status: 'approved', quote_amount: 80, visit_shown: 150 }, 'AED')).toBeNull();
    expect(disclosedCost('client', { payment_status: 'contract' }, 'AED')).toEqual({ label: 'Covered by contract', amount: null });
    expect(disclosedCost('client', { quote_status: 'approved', quote_amount: '80' }, 'AED')?.amount).toBe('AED 80.00');
    expect(disclosedCost('client', { visit_shown: '150' }, 'AED')?.label).toBe('Visit charge');
    expect(disclosedCost('client', {}, 'AED')).toBeNull();
  });
});

describe('learning and archives', () => {
  it('asks before remembering and refuses a one time change', () => {
    expect(classifyCorrection('just this once move it')).toEqual({ kind: 'once' });
    expect(classifyCorrection('from now on always send Ravi to Marina')).toMatchObject({ kind: 'ask', company: false });
    expect(classifyCorrection('from now on always do this for the company')).toMatchObject({ company: true });
    expect(classifyCorrection('move this job')).toBeNull();
    const ideas = habitSuggestions({ usual_start: '08:00', usual_areas: ['JLT'], hour: 7, recentAreas: ['Marina', 'Marina', 'Marina', 'JLT'] });
    expect(ideas.map(item => item.id)).toContain('start');
    expect(ideas.find(item => item.area)).toMatchObject({ area: 'Marina' });
  });
  it('keeps history unless there is nothing to keep', () => {
    expect(supplierChoice(0, 'ordered')).toBe('delete');
    expect(supplierChoice(2, 'ordered')).toBe('archive');
    expect(documentChoice(-1)).toBe('archive');
    expect(documentChoice(3)).toBe('keep');
    expect(contractChoice(2, false, false)).toBe('refuse');
    expect(contractChoice(2, true, true)).toBe('archive');
    expect(contractChoice(0, false, false)).toBe('clear');
  });
  it('reads on the way and the morning plan without calling a model', () => {
    expect(readOnTheWay('I am on the way')).toEqual({ order: null });
    expect(readOnTheWay("I'm on the way to 12")).toEqual({ order: 12 });
    expect(readOnTheWay('أنا على الطريق')).toEqual({ order: null });
    expect(readPlanAsk("today's plan")).toBe('morning');
    expect(readPlanAsk('أي شغل بدون تصريح بكرة')).toBe('gate');
    expect(readPlanApprove('approve the morning plan')).toBe('morning');
    expect(readOnTheWay('send a whatsapp')).toBeNull();
  });
});

describe('page views do not write', () => {
  it('the day plan and habit reads have no insert, update or delete', () => {
    const day = readFileSync('lib/services/day-plan.ts', 'utf8');
    const habits = readFileSync('lib/services/habits.ts', 'utf8');
    const readDay = day.slice(day.indexOf('export async function getDayPlan'), day.indexOf('const body = z.object'));
    const readHabits = habits.slice(habits.indexOf('export async function getHabits'), habits.indexOf('const areaBody'));
    expect(readDay).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(readHabits).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/);
    expect(day).toMatch(/No phone notification went out|planSavedReply/);
    expect(day).not.toMatch(/body\.user_id|input\.user/);
  });
});

describe('Gulf Arabic for the new sentences', () => {
  const file = JSON.parse(readFileSync('public/i18n/ar-AE.json', 'utf8')) as Record<string, string>;
  const sources = [
    ...Object.values(DAY_REPLIES), ...Object.values(LEARN_REPLIES), ...Object.values(ARCHIVE_REPLIES),
    planSavedReply(0), planSavedReply(1),
    'A short thank you', 'Send thanks', 'Pick a rating from 1 to 5.', 'Only the client rates the job.',
    'Confirm gate pass', 'Not needed', 'Show the move', 'Urgent call', 'Off sick', 'Nothing is waiting',
    'Mark this job late', 'This practice control marks the job late. No message is sent.',
    'Finish the contract', 'Clear the contract', 'Close this order', 'Close a parts order', 'Archive',
    'Archive this document?', 'Remember', 'Yes',
  ];
  it.each(sources)('%s is written by hand in Gulf Arabic', source => {
    expect(file[source], source).toBeTruthy();
    expect(validTranslation(source, file[source], 'ar-AE'), source).toBe(true);
    expect(rightScript(file[source], 'ar-AE'), source).toBe(true);
    expect(file[source]).not.toBe(source);
  });
});

describe('PR 2 review fixes', () => {
  it('only a sentence that starts with standing words becomes a rule', async () => {
    const { classifyCorrection } = await import('../lib/learn-habits');
    expect(classifyCorrection('The AC always leaks in the tower')).toBeNull();
    expect(classifyCorrection('Never mind, show my jobs')).toBeNull();
    expect(classifyCorrection('I am off just today')).toBeNull();
    expect(classifyCorrection('From now on put Marina jobs first')).toMatchObject({ kind: 'ask' });
    expect(classifyCorrection('Just this once move WO 12')).toEqual({ kind: 'once' });
  });
});
