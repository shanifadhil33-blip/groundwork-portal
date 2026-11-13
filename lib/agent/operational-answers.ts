import { nativeOperationalIntent } from './operational-phrases';
import { assistantWorkload } from '../services/assistant-reads';
import { LANGUAGES } from '../languages';
import { choiceWords } from './choices';
import { listWorkOrders } from '../services/work-orders';
import { needsAttention } from '../services/attention';
import { assistantWeek } from '../services/assistant-reads';
import { formatInLang } from '../date-lang';
import { statusLabels } from '../ui/work-orders';
import { isDemoWorkspace, localizedJobTitle } from './demo-titles';
import { jobLine } from './job-line';
export type OperationalIntent='overdue'|'attention'|'week'|'workload';
const normalize=(q:string)=>q.toLowerCase().replace(/[’]/g,"'").replace(/[?.!؟]+$/u,'').trim();
const prompts:Record<Exclude<OperationalIntent,'workload'>,string>={overdue:'Which work orders are overdue and who should I chase first? Explain briefly.',attention:'What is the most important thing I need to do today?',week:'Summarize this week for my team in two sentences.'};
/** Whole read requests only. A requested mutation or a named scope must continue to the agent. */
export function operationalIntent(question:string):OperationalIntent|null {
 const q=normalize(question);
 for(const lang of LANGUAGES)for(const [kind,prompt] of Object.entries(prompts))if(q===normalize(choiceWords(lang.code)(prompt)))return kind as OperationalIntent;
 if(/^(?:which (?:work orders|jobs) are (?:overdue|late)(?: and who should i chase first)?|(?:show|list) (?:overdue|late) (?:jobs|work orders))(?:[?.!]? explain briefly)?$/.test(q))return 'overdue';
 if(/^(?:what needs (?:my )?attention today|what(?:'s| is) (?:the )?(?:most important|top priority|most urgent)(?: thing)?(?: i (?:need to|should|must))? (?:do )?today|what should i do today|وش أهم شي لازم أسويه اليوم|شو أهم شي لازم أسويه اليوم)$/.test(q))return 'attention';
 if(/^(?:summari[sz]e this week(?: for my team)?(?: in two sentences)?|(?:give me )?(?:a )?(?:team )?week(?:ly)? summary|لخص هالأسبوع للفريق(?: بجملتين)?|لخص هذا الأسبوع(?: لفريقي)?(?: بجملتين)?)$/.test(q))return 'week';
 return nativeOperationalIntent(question);
}
const rank:Record<string,number>={urgent:0,high:1,normal:2,low:3};
export const chaseOrder=(a:any,b:any)=>(rank[a.priority]??4)-(rank[b.priority]??4)||String(a.due_on).localeCompare(String(b.due_on))||a.order_number-b.order_number;
/** One job on one line: number and title first, then site, priority, who has it and the due date. Starting with the
 * WO number keeps every line different, even when jobs share a site, priority, owner and due date. */
export function jobBlock(j:{number:number|string;title:string;site?:string|null;assignee:string|null;priority:string;due:string},t:(key:string)=>string,lang?:string|null){
 return jobLine(j.number,j.title,[j.site,j.priority,j.assignee?`${t('Assigned to')}: ${j.assignee}`:t('No technician yet'),`${t('Due')}: ${j.due}`],lang);
}
/** Opening lines, then one line per job. No blank lines, so no line in a reply is ever repeated. */
export const stack=(opening:string[],jobs:string[])=>[...opening,...jobs].filter(Boolean).join('\n');
export async function operationalAnswer(user:string,ws:string,kind:OperationalIntent,language?:string|null):Promise<string> {
 const lang=language?.startsWith('ar')?'ar-AE':language??'en-IN',t=choiceWords(lang);
 const fill=(key:string,values:Record<string,number>)=>t(key).replace(/\{(\w+)\}/g,(_,k)=>String(values[k]));
 if(kind==='workload'){
  const rows=await assistantWorkload(user,ws);
  return [`${t('Open')}: ${rows.reduce((sum,row)=>sum+row.open,0)}.`,...rows.map(row=>`${t('Assigned to')}: ${row.name||t('No technician yet')}. ${t('Open')}: ${row.open}.`),t('Visible open jobs only. The records do not explain why workloads differ.')].join('\n');
 }
 if(kind==='week'){
  const counts=await assistantWeek(user,ws);
  return `${fill('This week: {new} new jobs and {done} completed jobs.',counts)} ${fill('Still open: {open}, including {late} overdue.',counts)}`;
 }
 // Query the highest priority overdue slice first; break ties by the oldest deadline in the slice.
 const late=await listWorkOrders(user,ws,new URLSearchParams({overdue:'true',sort:'priority',dir:'desc',pageSize:'6'}));
 const jobs=[...late.data].sort(chaseOrder);
 const date=(d:string)=>formatInLang(new Date(`${d}T12:00:00Z`),{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'},lang,lang);
 const demo=lang.startsWith('en')?false:await isDemoWorkspace(user,ws);
 const title=(j:any)=>localizedJobTitle(j.title,lang,demo);
 const job=(j:any)=>jobBlock({number:j.order_number,title:title(j),site:j.site_name,assignee:j.assignee_name||null,priority:t(j.priority==='urgent'?'Urgent':j.priority==='high'?'High':j.priority==='low'?'Low':'Normal'),due:date(j.due_on)},t,lang);
 const head=`${t('Late jobs')}: ${late.total}.`;
 const first=jobs[0];
 const chase=first?`${t(first.assignee_name?'Chase first':'Assign an owner first')}: ${first.assignee_name||`Job #${first.order_number}`}. ${t('Highest priority first, then oldest deadline')}.`:'';
 if(kind==='overdue')return stack([head,chase],jobs.map(job));
 const [attention,today]=await Promise.all([needsAttention(user,ws),listWorkOrders(user,ws,new URLSearchParams({today:'true',active:'true',pageSize:'3',sort:'scheduled_for',dir:'asc'}))]);
 return [stack([head,chase],jobs.slice(0,3).map(job)),`${t('Today')}: ${today.total}.`,...today.data.map(j=>jobLine(j.order_number,title(j),[j.site_name,t(statusLabels[j.status]??j.status)],lang)),`${t('Suggested jobs')}: ${attention.suggested_jobs}. ${t('Unread messages')}: ${attention.unread_messages}. ${t('Unread updates')}: ${attention.unread_notifications}.`].filter(Boolean).join('\n');
}
