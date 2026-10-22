import { workloadQuestion } from './operational-phrases';
type Declaration = {name:string;description:string;parameters:unknown};
/** Select a small capability set after role filtering. Exact tool families keep unrelated schemas out. */
export function selectAssistantTools(question:string, declarations:Declaration[]):Declaration[] {
 const groups:[RegExp,string[]][]=[
  [/\b(?:add|invite|hire) (?:a |an )?(?:worker|technician|person|member)\b/i,['add_worker','list_contacts']],
  [/cancel|reopen|start|status|mark|stop/i,['update_work_order_status','cancel_visit','withdraw_request']],
  [/\b(?:queue|import|rows?)\b/i,['list_approval_queue','approve_queue_row','reject_queue_row']],
  [/member|role|permission/i,['set_member_roles','rename_role','list_team']],
  [/approval mode|ask before/i,['set_approval_mode']],
  [/photo|picture/i,['list_job_photos']],
  [/notification/i,['notification_status']],
  [/who am i|my role/i,['whoami']],
  [/assign|give.*job|worker|technician|فني|تعيين/i,['assign_work_order','suggest_worker','list_contacts','get_schedule']],
  [/date|visit|book|schedule|موعد/i,['update_work_order_dates','free_visit_slots','reschedule_visit','cancel_visit','confirm_visit','get_schedule']],
  [/paid|payment|cash|contract|دفع/i,['set_job_payment','visit_charge','waiting_prices']],
  [/fixed|done|finish|complete|part|خلص/i,['save_job_report','update_work_order_status','add_comment']],
  [/note|comment|log|save|ملاحظة/i,['add_comment','save_job_report']],
  [/create|new request|new job|raise|suggest|طلب جديد/i,['create_request','suggest_job','list_sites','list_clients']],
  [/leave|time off|day off|إجازة/i,['request_time_off','list_leave_requests','decide_time_off']],
  [/client|customer|عميل/i,['list_clients','create_client','update_client']],
  [/site|address|موقع/i,['list_sites','create_site','update_site']],
  [/asset|equipment/i,['list_assets','add_asset','update_asset']],
  [/remember|memory|name|تذكر/i,['remember_about_me','my_memory','forget_about_me','remember_word','my_words','set_call_me','list_contacts','suggest_contact_name']],
  [/priority|urgent|أولوية/i,['set_priority']],
  [/quote|price|cost|سعر/i,['waiting_prices','visit_charge','send_quote','answer_quote','fix_history']],
  [/message|send|رسالة/i,['list_messages','send_message','list_team_messages','send_team_message','list_contacts']],
  [/attention|today|اليوم/i,['needs_attention','get_dashboard','my_day']],
  [/week|summary|overview|أسبوع/i,['get_dashboard','needs_attention','my_day']],
  [/document|expir|licen|insurance/i,['list_documents','update_document','remove_document']],
  [/count|how many/i,['job_counts','my_fixes']],
  [/approv|declin|suggestion/i,['list_suggestions','approve_suggestion','decline_suggestion']],
  [/trade|skill|area/i,['set_job_trade','set_worker_skills','list_contacts','list_sites']],
 ];
 const wanted=groups.filter(([intent])=>intent.test(question)).flatMap(([,names])=>names);
 const tokens=question.toLowerCase().match(/[\p{L}]{4,}/gu)??[];
 const named=declarations.filter(d=>tokens.some(t=>d.name.split('_').includes(t))).map(d=>d.name);
 const lookup=/\b(?:wo|job|work order)\s*#?\s*\d+/i.test(question)?['get_work_order_by_number']:['list_work_orders','get_work_order_by_number'];
 const phrase=question.toLowerCase().replace(/\b(?:a|an|the|new)\b/g,'').replace(/\s+/g,' ');
 const exact=declarations.filter(d=>phrase.includes(d.name.replaceAll('_',' '))).map(d=>d.name);
 const order=[...new Set(['ask_choice',...(workloadQuestion(question)||/workload|most.*(?:jobs|work)|busiest|per technician/i.test(question)?['technician_workload','list_team']:[]),...lookup,...exact,...wanted,...named,'ask_supervisor',...(!wanted.length?['needs_attention','get_dashboard','my_day']:[])])];
 const selected:Declaration[]=[];let bytes=2;
 for(const name of order){
  const d=declarations.find(d=>d.name===name);if(!d)continue;
  const compact={...d,description:d.description.slice(0,360)};
  const size=Buffer.byteLength(JSON.stringify(compact))+1;
  if(bytes+size>6500)continue;
  selected.push(compact);bytes+=size;
 }
 return selected;
}
