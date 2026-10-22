import { recordResults } from './reply-grounding';
import { choiceWords } from './choices';
import { statusLabels } from '../ui/work-orders';
/** A deadline answer from successful reads already made this turn. Never echo tool errors or raw JSON. */
export function readEvidenceAnswer(results:unknown[],language?:string|null):string|null {
 const t=choiceWords(language),lines:string[]=[],seen=new Set<string>();
 const labels:Record<string,string>={overdue:'Late jobs',late:'Late jobs',today_jobs:'Today',suggested_jobs:'Suggested jobs',unread_messages:'Unread messages',unread_notifications:'Unread updates',total:'Jobs',done:'Done',open:'Open',waiting_on_parts:'Waiting for parts'};
 const add=(line:string)=>{if(!seen.has(line)&&lines.length<10){seen.add(line);lines.push(line);}};
 const walk=(value:any,depth=0):void=>{
  if(depth>8||value==null||lines.length>=10)return;
  if(Array.isArray(value)){for(const row of value.slice(0,6))walk(row,depth+1);return;}
  if(typeof value!=='object')return;
  if(value.order_number&&typeof value.title==='string'){
   add([`WO ${value.order_number}: ${value.title}`,value.assignee_name?`${t('Assigned to')}: ${value.assignee_name}`:'',value.status?`${t('Status')}: ${t(statusLabels[value.status]??value.status)}`:''].filter(Boolean).join('. '));return;
  }
  if('assignee_id' in value&&typeof value.open==='number'){add(`${t('Assigned to')}: ${value.name||t('Unassigned')}. ${t('Open')}: ${value.open}.`);return;}
  for(const [key,item] of Object.entries(value)){
   if(labels[key]&&typeof item==='number')add(`${t(labels[key])}: ${item}.`);
   else if(item&&typeof item==='object')walk(item,depth+1);
  }
  if(typeof value.name==='string')add(value.name);
  else if(typeof value.title==='string')add(value.title);
 };
 for(const result of recordResults(results))walk(result);
 return lines.length?lines.join('\n'):null;
}
