import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { validTranslation, rightScript } from '../lib/i18n';
import { CLOSE_REPLIES, SAMPLE_PRICE_LIST, canMarkNoPhotos, canSignOff, doneCard, draftCost, draftLines, englishCopyMark, lowRatingRecipients, noPhotosRefusal, readSignOff, signOffRefusal, signOffReminder } from '../lib/job-close';
import { PHONE_REPLIES, hashPhoneCode, phoneCodeMatches, readPhoneAsk } from '../lib/phone-change';
import { phoneKey } from '../lib/phone-key';
import { openSealed, seal } from '../lib/secret-box';
import { readUsualAsk, usualValid } from '../lib/usual-context';
import { WARM_TONE, warmLead } from '../lib/warm-reply';
import { replyButtons, reviewReply, routeChannel, type ChannelPerson } from '../lib/whatsapp-channel';

const secret = 'test-secret';
const person = (user_id: string, role = 'technician'): ChannelPerson => ({ user_id, role, workspace_id: 'ws', client_id: null });
const job = { status: 'done', client_id: 'client', created_by: 'home', assignee_id: 'tech' };

describe('WA02 channel', () => {
  it('a known number reaches that person and an unknown number can only be reviewed', () => {
    const known = routeChannel('ws', [person('u1')], { from: '+971 50 000 1234', name: 'Faisal', text: 'The tap leaks' });
    expect(known).toMatchObject({ kind: 'agent', text: 'The tap leaks', person: { user_id: 'u1' } });
    const voice = routeChannel('ws', [person('u1')], { from: '971500001234', name: 'Faisal', voice_note: 'Job done, washer replaced' });
    expect(voice).toMatchObject({ kind: 'agent', voice: true, text: 'Job done, washer replaced' });
    const unknown = routeChannel('ws', [], { from: '+971500009999', name: 'Nadir', text: 'Please visit', button: 'yes', action_id: 'act' });
    expect(unknown.kind).toBe('review');
    expect(reviewReply(unknown as Extract<typeof unknown, { kind: 'review' }>, 'Nadir')).not.toMatch(/yes|confirm/i);
    expect(routeChannel('ws', [person('a'), person('b')], { from: '971500001234', name: 'Faisal', text: 'Hi' }).kind).toBe('review');
    expect(routeChannel('ws', [person('u1', 'client')], { from: '123', name: 'Faisal' })).toMatchObject({ kind: 'review', reason: 'empty' });
  });
  it('a known person gets yes and change for a card, and a short number is not a match', () => {
    const yes = routeChannel('ws', [person('u1')], { from: '00971500001234', name: 'Faisal', button: 'yes', action_id: 'act' });
    expect(yes).toMatchObject({ kind: 'confirm', decision: 'yes', action_id: 'act' });
    expect(replyButtons('act').map(b => b.title)).toEqual(['Yes', 'Change']);
    expect(phoneKey('00971 50 000 1234')).toBe('971500001234');
  });
});

describe('SIGN10 phone check', () => {
  it('asks for the number, then a code, and does not save on a wrong code', () => {
    expect(readPhoneAsk('Change my phone number')).toEqual({ kind: 'ask_number' });
    expect(readPhoneAsk('My phone number is +971 50 111 2233')).toEqual({ kind: 'number', phone: '971501112233' });
    expect(readPhoneAsk('123456')).toEqual({ kind: 'code', code: '123456' });
    expect(readPhoneAsk('put this in memory: I start at 7')).toEqual({ kind: 'none' });
    const hash = hashPhoneCode('123456', secret);
    expect(phoneCodeMatches('123456', hash, secret)).toBe(true);
    expect(phoneCodeMatches('000000', hash, secret)).toBe(false);
    for (const line of Object.values(PHONE_REPLIES)) expect(line).not.toMatch(/\d{6}/);
  });
});

describe('SEC06 sealing', () => {
  it('seals a phone and a voice note and refuses a changed copy', () => {
    const sealed = seal('+971501112233', secret);
    expect(sealed.startsWith('gw1.')).toBe(true);
    expect(sealed).not.toContain('971501112233');
    expect(openSealed(sealed, secret)).toBe('+971501112233');
    expect(openSealed(sealed, 'other')).toBeNull();
    expect(openSealed(`${sealed}x`, secret)).toBeNull();
    expect(openSealed('plain words', secret)).toBe('plain words');
  });
});

describe('LEARN02 and LEARN05', () => {
  it('keeps a warm voice without rewriting a safety line', () => {
    expect(WARM_TONE).toMatch(/warm, friendly and plain/);
    expect(warmLead('Ravi', 'The job is done.')).toBe('Ravi, the job is done.');
    expect(warmLead('Ravi', 'Safety first. Leave the room.')).toBe('Safety first. Leave the room.');
    expect(warmLead('Ravi', 'Ravi, hello.')).toBe('Ravi, hello.');
  });
  it('keeps usual start and areas for the whole message only', () => {
    expect(readUsualAsk('I start at 7')).toEqual({ start: '07:00' });
    expect(readUsualAsk('I start at 7 now')).toEqual({ start: '07:00' });
    expect(readUsualAsk('put this in memory: I start at 7')).toBeNull();
    expect(usualValid(readUsualAsk('I start at 5')!)).toMatch(/six in the morning/);
    expect(readUsualAsk('My usual areas are Marina, JLT and Deira')).toEqual({ areas: ['Marina', 'JLT', 'Deira'] });
    expect(usualValid({ areas: [] })).toBeTruthy();
    expect(usualValid({ start: '05:00' })).toBeTruthy();
    expect(usualValid({ start: '07:00', areas: ['Marina'] })).toBeNull();
  });
});

describe('JOB14 JOB15 PHOTO04 TECH05 TECH09 CLIENT07 LANG06', () => {
  it('lets the client or the office sign off a finished job and never undoes it', () => {
    expect(canSignOff({ role: 'client', client_kind: 'household', user: 'home', client_id: 'client' }, job)).toBe(true);
    expect(canSignOff({ role: 'client', client_kind: 'household', user: 'other', client_id: 'client' }, job)).toBe(false);
    expect(canSignOff({ role: 'staff', staff_kind: 'office', user: 'sam', client_id: null }, job)).toBe(true);
    expect(canSignOff({ role: 'technician', user: 'tech', client_id: null }, job)).toBe(false);
    expect(canSignOff({ role: 'client', user: 'home', client_id: 'client' }, { ...job, signed_off_at: '2026-11-16' })).toBe(false);
    expect(signOffRefusal({ role: 'technician', user: 'tech' }, job)).toBe(CLOSE_REPLIES.onlyClient);
    expect(readSignOff('Please sign off WO 12')).toEqual({ order: 12 });
    expect(readSignOff('sign off the other job')).toBeNull();
    expect(signOffReminder('ar-AE')).toMatch(/[\u0600-\u06FF]/);
  });
  it('builds a draft only from reported work and parts', () => {
    expect(draftLines({})).toEqual([]);
    const lines = draftLines({ report_work: 'Changed the washer', report_part: 'Washer' });
    expect(lines.map(line => line.detail)).toEqual(['Changed the washer', 'Washer']);
    expect(lines[1].amount).toBe(SAMPLE_PRICE_LIST.find(row => row.label === 'Washer')?.amount);
    expect(draftLines({ report_part: 'Mystery motor' })[0].amount).toBeNull();
    expect(draftCost(draftLines({ report_part: 'Mystery motor' }))).toBeNull();
    expect(draftCost(lines)).toBe('175.00');
  });
  it('marks no photos only on a closed job that has none', () => {
    expect(canMarkNoPhotos({ role: 'technician', user: 'tech' }, job, 0)).toBe(true);
    expect(canMarkNoPhotos({ role: 'technician', user: 'other' }, job, 0)).toBe(false);
    expect(canMarkNoPhotos({ role: 'client', user: 'home', client_id: 'client' }, job, 0)).toBe(false);
    expect(noPhotosRefusal({ role: 'technician', user: 'tech' }, job, 2)).toBe(CLOSE_REPLIES.photosExist);
    expect(noPhotosRefusal({ role: 'technician', user: 'tech' }, { ...job, status: 'open' }, 0)).toBe(CLOSE_REPLIES.markWaits);
  });
  it('shows the full done card, a translated English copy, and sends a low rating to the supervisor', () => {
    const card = doneCard({ outcome: 'fixed', name: 'Ravi', problem: 'Tap leaking', work: 'New washer', before: 1, after: 0 });
    expect(card.title).toMatch(/Great work/);
    expect(card.lines.map(line => line.value)).toContain('Fixed');
    expect(card.lines.map(line => line.value)).toContain('No photos');
    expect(card.lines.map(line => line.value)).not.toContain('fixed');
    expect(englishCopyMark('en', 'New washer')).toBeNull();
    expect(englishCopyMark('hi', 'New washer')).toEqual({ label: 'Translated', text: 'New washer' });
    const people = [
      { user_id: 'tech', role: 'technician' },
      { user_id: 'office', role: 'staff', staff_kind: 'office' },
      { user_id: 'sam', role: 'staff', staff_kind: null },
      { user_id: 'imran', role: 'admin' },
    ];
    expect(lowRatingRecipients(people, 'tech')).toEqual(['sam']);
    expect(lowRatingRecipients(people.filter(p => p.user_id !== 'sam'), 'tech')).toEqual(['imran']);
  });
});

describe('Gulf Arabic words', () => {
  const file = JSON.parse(readFileSync('public/i18n/ar-AE.json', 'utf8')) as Record<string, string>;
  it.each([
    'Sign off', 'No photos', 'Draft bill', 'Translated', 'Usual start', 'Usual areas',
    'Send a code to this number?', 'Usual start is on the hour from six in the morning to eight in the evening.',
    'Please sign off the finished job when you can.', 'A client gave a low rating. Open the job.',
    'Work reported', 'Part reported', 'Temporary fix', 'That did not save. Try again.',
    'I could not do that right now, so nothing was changed. Try again in a minute.',
  ])('%s is written by hand in Gulf Arabic', source => {
    expect(validTranslation(source, file[source], 'ar-AE'), source).toBe(true);
    expect(rightScript(file[source], 'ar-AE')).toBe(true);
    expect(file[source]).not.toBe(source);
  });
});

describe('review fixes', () => {
  it('never claims a code was sent while no sender is connected', async () => {
    const { codeSenderReady, PHONE_REPLIES: P } = await import('../lib/phone-change');
    expect(codeSenderReady({})).toBe(false);
    expect(codeSenderReady({ PHONE_CODE_SENDER: 'whatsapp', WHATSAPP_SEND_TOKEN: 'x' })).toBe(true);
    expect(P.noSender).toMatch(/no code went out/);
    expect(P.noSender).not.toMatch(/[\u2013\u2014-]/);
  });
});
