import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { LANGUAGES } from '../lib/languages';
import { isEnglish, readTranslationCache, replaceTranslation } from '../lib/i18n';
import { demoJobTranslations } from '../lib/demo-job-copy';
import { DEMO_ROUND_TWO_COPY } from '../lib/demo-round-two-copy';
import { UI_TRANSLATION_TEMPLATES } from '../lib/ui-translation-templates';
import { agentPriorityTemplate, agentSummaryTemplate, auditSummaryTemplates, auditTemplates } from '../lib/ui/audit-summary';
import { renderNotification } from '../lib/ui/notifications';
import { scheduleHourLabel } from '../lib/date-lang';
import { SCHEDULE_HINT, CHANGE_SCHEDULE_HINT } from '../components/app/schedule-hint';

const interfaceCopy = [
 'Your questions', 'Your questions to a supervisor', 'Waiting for your supervisor. Nothing changes until they answer.', 'My time off', 'Waiting', 'Comment', 'Import', 'Import row', 'Agent key', 'Invite', 'Job activity', 'Supplier update', 'Notification', 'Needs you', 'Reads the message, photo or voice note from the app and writes it up as a suggested job.',
 'Open job', 'Nobody is away. Add leave here, and jobs are not given to that person on those days.',
 'Your workspace', 'Sign out', 'Drawer navigation', 'Edit client', 'Main contact', 'Billing address',
 '· ends', 'Add site', 'Site contact:', 'Access:', 'Sends requests and sees their own jobs.',
 'Client and site are fixed for an existing job.', 'None', 'Agent needs your call', 'asked',
 'Agent suggests:', 'Yes, approve', 'Fix it', 'When the office gives you a job, it shows here.',
 'United Arab Emirates, Dubai. Sets address fields, phone format and currency.',
 'Demo ·', 'Database role', 'Portal role', '· application connection', 'client', 'returned',
 'Another workspace', 'Northgate query', 'Northgate query · your company', 'Run isolation check again',
 'Northgate is your company, so Postgres row level security allows these rows.',
 'Postgres row level security returned nothing because this session belongs to another client.',
 'Postgres row level security returned nothing because this session belongs to another workspace.',
 'No description provided.', 'Loading', 'Your requests', 'Withdraw request', 'Reschedule', 'Ask for', 'again',
];
it.each(LANGUAGES.filter(l => !isEnglish(l.code)))('$code covers every round two fixture, interface and summary template using validated shipped words', ({code}) => {
 const words = readTranslationCache(readFileSync(`public/i18n/${code}.json`, 'utf8'), code);
 Object.assign(words, demoJobTranslations(words));
 for (const source of [...DEMO_ROUND_TWO_COPY, ...UI_TRANSLATION_TEMPLATES, ...Object.values(auditTemplates), agentPriorityTemplate, SCHEDULE_HINT, CHANGE_SCHEDULE_HINT]) {
  expect(words[source], `${code}: ${source}`).toBeTruthy();
  expect(words[source], `${code}: ${source}`).not.toBe(source);
  if (code === 'ar-AE') expect(words[source]).not.toMatch(/\bagent\b/i);
 }
 for (const source of interfaceCopy) expect(replaceTranslation(source,words), `${code}: ${source}`).not.toBe(source);
 const label = replaceTranslation('16 Open for Ravi', words);
 expect(label).toContain('16'); expect(label).toContain('Ravi'); expect(label).toContain(words.Open);
 expect(label).not.toContain(' for ');
 for (const source of ['New requests, 1 waiting','23 open requests','42 requests','0 today','Excel or CSV file, up to 500 lines','Up to 2 MB · 500 data rows · unique column headings','Try the flow with a sample file of 40 jobs.','For example, weekday mornings 9 to 12']) expect(replaceTranslation(source, words), source).not.toBe(source);
 expect(replaceTranslation('Remove leave for Ravi', words)).toContain('Ravi');
 expect(words['Remove leave for Ravi']).toBeUndefined();
 expect(replaceTranslation('Move Service rooftop ventilation', words, true)).toContain(words['Service rooftop ventilation']);
 expect(replaceTranslation('Move Service rooftop ventilation', words, false)).toContain('Service rooftop ventilation');
 expect(replaceTranslation('Move Settings', words, true)).toContain('Settings');
 expect(replaceTranslation('Select row 1: Inspect reception lighting', words, true)).toContain(words['Inspect reception lighting']);
 for (const hour of [9,11,14,16]) expect(scheduleHourLabel(hour, code)).not.toMatch(/\bAM\b|\bPM\b/);
});
it('audit templates retain each simultaneous change and carry ISO dates for the viewer, without embedding user data in keys', () => {
 const before = {title:'My authored job',assignee_id:null,scheduled_for:null,due_on:null};
 const after = {...before,assignee_id:'ravi',assignee_name:'Ravi',scheduled_for:'2026-10-20T05:00:00.000Z',due_on:'2026-10-20'};
 const messages = auditSummaryTemplates({actor_name:'Imran',entity:'work_orders',action:'update',before,after})!;
 expect(messages).toHaveLength(3);
 expect(messages[0].values).toMatchObject({name:'Imran',job:'My authored job',person:'Ravi'});
 expect(messages.slice(1).map(m => m.dateValues?.date)).toEqual([after.scheduled_for,after.due_on]);
 const words = JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8'));
 for (const message of messages) {
  expect(message.key).not.toMatch(/Imran|Ravi|My authored job|2026/);
  const text = renderNotification(message, words, 'ar-AE');
  expect(text).toContain('Imran'); expect(text).toContain('My authored job');
  expect(text).not.toMatch(/Oct|assigned|scheduled|due date/);
 }
 expect(renderNotification(messages[2],words,'ar-AE')).not.toMatch(/\d{1,2}:\d{2}/);
 const member = auditSummaryTemplates({actor_name:'Imran',member_name:'Pranav',entity:'members',action:'update',after:{role:'client'}})![0];
 expect(renderNotification(member,words,'ar-AE')).toContain(words['Facility manager']);
});
it('legacy Agent priority summaries use templates, preserve identifiers and translate both priorities', () => {
 const source = 'Change priority for WO 1 My repair: low to high';
 const message = agentSummaryTemplate(source)!;
 expect(message.values.job).toBe('Job #1 My repair');
 const words = JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8'));
 const text = renderNotification(message,words,'ar-AE');
 expect(text).toContain('مهمة #1 My repair'); expect(text).toContain(words.Low); expect(text).toContain(words.High);
 expect(agentSummaryTemplate('My own note about priority')).toBeNull();
});
it('audit comments preserve visibility and supplier events preserve references without using stored English summaries', () => {
 const words = JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8'));
 for (const visibility of ['client','internal']) {
  const messages = auditSummaryTemplates({actor_name:'Faisal',entity:'comments',action:'insert',work_order_title:'My repair',after:{visibility,body:'My private authored note'}})!;
  const text = messages.map(message => renderNotification(message,words,'ar-AE')).join(' ');
  expect(text).toContain('Faisal'); expect(text).toContain('My repair');
  expect(text).not.toMatch(/created|visible|internal|private authored note/);
  expect(messages[0].key).toContain(visibility === 'internal' ? 'internal note' : 'visible to the client');
 }
 const events = auditSummaryTemplates({actor_name:'Imran',entity:'supplier_events',action:'insert',after:{cobalt_ref:'COBALT-DEMO-1',status:'ordered'}})!;
 const text = events.map(message => renderNotification(message,words,'ar-AE')).join(' ');
 expect(text).toContain('COBALT-DEMO-1'); expect(text).toContain(words.Ordered);
 expect(text).not.toMatch(/created|supplier update|Ordered/);
});

it.each(['en-IN','en-US','en-GB'])('schedule clocks honor the %s locale as well as the non-English locales', code => {
 const date = new Date(Date.UTC(2026,0,1,14));
 expect(scheduleHourLabel(14,code)).toBe(new Intl.DateTimeFormat(code,{hour:'numeric',timeZone:'UTC'}).format(date));
});
it('audit import templates keep filenames as data and localize the queue status', () => {
 const words = JSON.parse(readFileSync('public/i18n/ar-AE.json','utf8'));
 const messages = auditSummaryTemplates({actor_name:'Sam',entity:'imports',action:'insert',after:{filename:'sample.csv',status:'queued'}})!;
 const text = messages.map(message => renderNotification(message,words,'ar-AE')).join(' ');
 expect(text).toContain('Sam'); expect(text).toContain('sample.csv'); expect(text).toContain(words.Queued);
 expect(text).not.toMatch(/created import|Queued/);
 for (const message of messages) expect(message.key).not.toContain('sample.csv');
});
