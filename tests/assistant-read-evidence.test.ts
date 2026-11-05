import { expect, it } from 'vitest';
import { readEvidenceAnswer } from '../lib/agent/read-evidence-answer';
const result=(value:unknown)=>({structuredContent:{result:value}});
it('answers from successful reads with localized labels without exposing identifiers or errors',()=>{
 const answer=readEvidenceAnswer([result({data:[{order_number:7,title:'Cooling',assignee_name:'Sam',status:'scheduled',id:'private-id'}],total:1}),{isError:true,...result({name:'private-error'})}],'ar-AE');
 expect(answer).toContain('Job #7: Cooling');expect(answer).toContain('Sam');expect(answer).toMatch(/\p{Script=Arabic}/u);expect(answer).not.toContain('private');
});
it('returns null when no successful reads contain usable evidence',()=>expect(readEvidenceAnswer([{isError:true,...result({total:5})}])).toBeNull());

it('checklist evidence keeps material quantities and notes in the supervisor answer',()=>{
 const answer=readEvidenceAnswer([result({steps:[{name:'Clean the filter',done:true},{name:'Check cooling',done:false}],materials:[{id:'private',name:'Capacitor',quantity:2,note:'Outdoor unit'}]})],'en-IN');
 expect(answer).toContain('1 of 2 steps done');expect(answer).toContain('2 × Capacitor');expect(answer).toContain('Outdoor unit');expect(answer).not.toContain('private');
});
