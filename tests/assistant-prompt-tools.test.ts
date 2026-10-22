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
it('keeps the requested action and lookup when using full production schemas',async()=>{
 const {tools}=await import('../lib/agent/tools');const {z}=await import('zod');
 const declarations=Object.entries(tools).map(([name,t])=>({name,description:t.description,parameters:z.toJSONSchema(t.schema,{io:'input'})}));
 for(const [question,action] of [['Assign WO 12 to Ramon tomorrow','assign_work_order'],['Add a note to WO 12','add_comment'],['Create a new request at Marina','create_request'],['Cancel WO 12','update_work_order_status'],['Add a worker','add_worker']]){
  const chosen=selectAssistantTools(question,declarations);
  expect(chosen.map(t=>t.name),question).toContain(action);
  expect(chosen.map(t=>t.name)).toContain('get_work_order_by_number');
  expect(chosen.map(t=>t.name)).toContain('ask_choice');
  expect(Buffer.byteLength(JSON.stringify(chosen))).toBeLessThanOrEqual(6500);
 }
});
it('caps aggregate tool data while retaining complete call/result pairs',async()=>{
 const {compactAssistantHistory}=await import('../lib/ai');
 const history:any[]=[{role:'user',content:'Check overdue work'}];
 for(let i=0;i<30;i++)history.push({role:'call',name:'list_work_orders',args:{},id:String(i)},{role:'result',name:'list_work_orders',id:String(i),result:{structuredContent:{result:{data:Array.from({length:6},()=>({title:'ع'.repeat(300),id:'id'}))}}}});
 const compact=compactAssistantHistory(history);
 expect(compact).toHaveLength(history.length);
 expect(Buffer.byteLength(JSON.stringify(compact.filter(m=>m.role==='result')))).toBeLessThan(11000);
 expect(JSON.stringify(compact)).toContain('truncated');
});
