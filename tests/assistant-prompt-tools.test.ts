import { expect, it } from 'vitest';
import { selectAssistantTools } from '../lib/agent/prompt-tools';
import { compactSnapshot } from '../lib/ai';
it('selects intent tools and excludes unrelated actions within a bounded schema budget',()=>{
 const names=['ask_choice','list_work_orders','set_job_payment','assign_work_order','get_schedule','delete_client'];
 const tools=names.map(name=>({name,description:'x'.repeat(1000),parameters:{type:'object'}}));
 const chosen=selectAssistantTools('Who should I assign to WO 12?',tools);
 expect(chosen.map(t=>t.name)).toContain('assign_work_order');
 expect(chosen.map(t=>t.name)).not.toContain('set_job_payment');
 expect(chosen.map(t=>t.name)).not.toContain('delete_client');
 expect(Buffer.byteLength(JSON.stringify(chosen))).toBeLessThan(6600);
});
it('caps nested multilingual results as a whole and removes duplicated text',()=>{
 const value={content:[{text:'private duplicate'}],structuredContent:{result:{data:Array.from({length:80},()=>Object.fromEntries(Array.from({length:30},(_,i)=>['field'+i,'ع'.repeat(3000)])))}}};
 const json=JSON.stringify(compactSnapshot(value));
 expect(Buffer.byteLength(json)).toBeLessThanOrEqual(6000);
 expect(json).not.toContain('private duplicate');
 expect(json).toContain('truncated');
});
