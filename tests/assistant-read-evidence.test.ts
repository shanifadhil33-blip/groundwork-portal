import { expect, it } from 'vitest';
import { readEvidenceAnswer } from '../lib/agent/read-evidence-answer';
const result=(value:unknown)=>({structuredContent:{result:value}});
it('answers from successful reads with localized labels without exposing identifiers or errors',()=>{
 const answer=readEvidenceAnswer([result({data:[{order_number:7,title:'Cooling',assignee_name:'Sam',status:'scheduled',id:'private-id'}],total:1}),{isError:true,...result({name:'private-error'})}],'ar-AE');
 expect(answer).toContain('WO 7: Cooling');expect(answer).toContain('Sam');expect(answer).toMatch(/\p{Script=Arabic}/u);expect(answer).not.toContain('private');
});
it('returns null when no successful reads contain usable evidence',()=>expect(readEvidenceAnswer([{isError:true,...result({total:5})}])).toBeNull());
