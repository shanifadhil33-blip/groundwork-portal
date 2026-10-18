import { expect,it } from 'vitest';
import { fixJobTitles,jobsSeen,labelJob,labelJobs } from '../lib/agent/job-labels';
const r=(v:unknown)=>({content:[{type:'text',text:JSON.stringify(v)}]});
it('labels each job with its number and title, and ties the price to the same job',()=>{
 const j=labelJob({order_number:1,title:'Replace lobby light fixture',quote_amount:'850.00',quote_status:'pending',quote_note:'New LED light fitting and one hour of work.'},'AED');
 expect(j.job).toBe('WO 1, Replace lobby light fixture');
 expect(j.price).toBe('AED 850.00 for WO 1, Replace lobby light fixture (waiting for the client). Price note: New LED light fitting and one hour of work.');
 expect(labelJob({order_number:2,title:'Fix tap',quote_amount:null,quote_status:null},'AED').price).toBeUndefined();
 expect(labelJobs({data:[{order_number:3,title:'A'}],total:1},'AED').data[0].job).toBe('WO 3, A');
});
it('puts the right title back next to a WO number when the model used another job title',()=>{
 const seen=jobsSeen([r({data:[{order_number:1,title:'Service water pump'},{order_number:25,title:'Replace lobby light fixture'}]})]);
 expect(seen.get(1)).toBe('Service water pump');
 expect(fixJobTitles('Yes, there is a price waiting on WO 1, Replace lobby light fixture, AED 850.00.',seen)).toBe('Yes, there is a price waiting on WO 1, Service water pump, AED 850.00.');
 expect(fixJobTitles('**WO 25**: Replace lobby light fixture is overdue.',seen)).toBe('**WO 25**: Replace lobby light fixture is overdue.');
 expect(fixJobTitles('WO-1 Replace lobby light fixture',seen)).toBe('WO-1 Service water pump');
 expect(fixJobTitles('Nothing about jobs here.',seen)).toBe('Nothing about jobs here.');
 // A WO number the tool results never showed is left alone.
 expect(fixJobTitles('WO 9, Replace lobby light fixture',seen)).toBe('WO 9, Replace lobby light fixture');
});
