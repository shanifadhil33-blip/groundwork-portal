type Declaration = {name:string;description:string;parameters:unknown};
/** Select a small capability set, after role filtering. Authorization still runs on the server. */
export function selectAssistantTools(question:string, declarations:Declaration[]):Declaration[] {
 const groups:[RegExp,RegExp][]=[
  [/assign|worker|technician|فني|تعيين/i,/assign|suggest_worker|schedule|contacts|work_order/],
  [/date|visit|book|schedule|موعد/i,/visit|schedule|work_order.*dates|work_order_by_number/],
  [/paid|payment|cash|contract|دفع/i,/payment|contract|work_order_by_number/],
  [/note|comment|log|save|fixed|done|part|ملاحظة|خلص/i,/comment|report|work_order|suggest_job/],
  [/leave|time off|day off|إجازة/i,/time_off|leave|contacts/],
  [/client|customer|site|asset|عميل|موقع/i,/client|site|asset|work_order/],
  [/remember|memory|name|تذكر/i,/remember|forget|call_me|contact/],
  [/priority|urgent|أولوية/i,/priority|work_order_by_number/],
 ];
 const matched=groups.filter(([intent])=>intent.test(question)).map(([,names])=>names);
 const tokens=question.toLowerCase().match(/[\p{L}]{4,}/gu)??[];
 const base=new Set(['ask_choice','ask_supervisor','list_work_orders','get_work_order_by_number','needs_attention','get_dashboard','my_day']);
 const ranked=declarations.map((d,index)=>({d,index,score:matched.some(re=>re.test(d.name))?3:tokens.some(t=>d.name.includes(t))?2:base.has(d.name)?1:0})).filter(v=>v.score).sort((a,b)=>b.score-a.score||a.index-b.index);
 const selected:Declaration[]=[];let bytes=0;
 for(const {d} of ranked){const compact={...d,description:d.description.slice(0,360)};const size=Buffer.byteLength(JSON.stringify(compact));if(bytes+size>6500)continue;selected.push(compact);bytes+=size;}
 return selected;
}
