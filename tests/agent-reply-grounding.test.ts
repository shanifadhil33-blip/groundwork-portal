import { afterEach, expect, it, vi } from 'vitest';
import { groundedReply, RECORDS_FALLBACK } from '../lib/agent/reply-grounding';
const tool = (result: unknown) => ({structuredContent:{result}});
const job = {order_number:58,title:'Fix pump',assignee_name:'Ravi Kumar',quote_amount:'150.00',scheduled_for:'2026-11-08T05:00:00Z'};
afterEach(() => vi.restoreAllMocks());
it.each([
 ['WO 99 is open.', 'job'],
 ['Ramon has completed the repair.', 'name'],
 ['Anil will handle the repair.', 'name'],
 ['Sam is free tomorrow.', 'name'],
 ['The job is assigned to Anil.', 'name'],
 ['Assigned to Anil.', 'name'],
 ['WO 99 is open, right?', 'job'],
 ['WO 58 costs AED 999.00.', 'price'],
 ['WO 58 is booked for 9 November 2026.', 'date'],
 ['Ravi has completed 99 jobs.', 'count'],
])('replaces only an unsupported sentence: %s', (sentence, kind) => {
 const log = vi.spyOn(console,'warn').mockImplementation(() => {});
 expect(groundedReply(`Hello. ${sentence} I can help you check.`,[tool({data:[job],total:1})]))
  .toBe(`Hello. ${RECORDS_FALLBACK} I can help you check.`);
 expect(log).toHaveBeenCalledWith('[assistant] record mismatch',expect.objectContaining({[kind]:1}));
 expect(JSON.stringify(log.mock.calls)).not.toMatch(/Ramon|Anil|Ravi|999|99|58|150/);
});
it('keeps supported names, job numbers, prices, formatted dates, counts and markdown links', () => {
 const reply='Ravi has completed 3 jobs. WO 58 costs AED 150.00. WO 58 is booked for 8 November 2026. [Open WO 58](/work-orders/abc).';
 expect(groundedReply(reply,[tool({data:[job],total:3})])).toBe(reply);
 expect(groundedReply('The job is assigned to Ravi Kumar.',[tool(job)])).toBe('The job is assigned to Ravi Kumar.');
});
it('checks each job against its own price and date', () => {
 vi.spyOn(console,'warn').mockImplementation(() => {});
 const other={order_number:59,title:'Fix light',quote_amount:'999.00',scheduled_for:'2026-11-09'};
 expect(groundedReply('WO 58 costs AED 999.00. WO 58 is booked for 9 November 2026.',[tool([job,other])]))
  .toBe(`${RECORDS_FALLBACK} ${RECORDS_FALLBACK}`);
});
it('does not use IDs or job numbers as proof of prices or counts', () => {
 vi.spyOn(console,'warn').mockImplementation(() => {});
 expect(groundedReply('WO 58 costs AED 58.00. Ravi completed 58 jobs.',[tool(job)]))
  .toBe(`${RECORDS_FALLBACK} ${RECORDS_FALLBACK}`);
});
it('ignores failed results and handles plain JSON result payloads', () => {
 vi.spyOn(console,'warn').mockImplementation(() => {});
 expect(groundedReply('WO 58 is open.',[{...tool(job),isError:true}])).toBe(RECORDS_FALLBACK);
 expect(groundedReply('WO 58 is open.',[{content:[{text:JSON.stringify(job)}]}])).toBe('WO 58 is open.');
 expect(groundedReply('WO 58 is open.',[{content:[{text:'not JSON'}]}])).toBe(RECORDS_FALLBACK);
});
it.each(['Hello, Imran. How can I help?', 'Which job do you mean?', 'Do you mean WO 99?', 'I could not find WO 99.', 'I cannot change that price. Ask a supervisor.', 'Please give a WO number.', 'Open Work orders to check your jobs.', 'This is ready to review.', 'There is nothing to change.', 'Today is a good time to check.'])('keeps normal conversation: %s', reply => {
 expect(groundedReply(reply,[],['Imran'])).toBe(reply);
});
it('keeps line breaks and handles Arabic Indic job numbers', () => {
 vi.spyOn(console,'warn').mockImplementation(() => {});
 expect(groundedReply('WO ٥٨ is open.\nWO ٩٩ is open.\nHow can I help?',[tool(job)]))
  .toBe(`WO ٥٨ is open.\n${RECORDS_FALLBACK}\nHow can I help?`);
});

it('does not mistake an ordinary pronoun for a name', () => {
 expect(groundedReply('He has not replied yet.',[])).toBe('He has not replied yet.');
});
