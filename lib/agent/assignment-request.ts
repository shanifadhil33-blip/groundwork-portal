import { callTool, type AgentContext } from './tools';
import { localDate, scheduledInstant } from '../dates';

/** A narrow explicit command works even when the free providers are unavailable. Reads stay role scoped. */
export async function assignmentRequest(c:AgentContext,question:string,role:string,office:boolean,timezone:string) {
 if(!['admin','staff'].includes(role)||office)return null;
 const match=question.trim().match(/^(?:assign|give)\s+WO\s*(\d+)\s+to\s+([\p{L}][\p{L}' ]*?)(?:\s+(tomorrow|on\s+(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)|\d{4}-\d{2}-\d{2}))?[.!]?$/iu);
 if(!match)return null;
 const jobResult=await callTool(c,'get_work_order_by_number',{number:Number(match[1])});
 const teamResult=await callTool(c,'list_team',{});
 if(jobResult.isError||teamResult.isError)return null;
 const job=(jobResult.structuredContent as any)?.result;
 const team=(teamResult.structuredContent as any)?.result;
 const people=Array.isArray(team)?team:team?.data??team?.people??[];
 const matches=people.filter((p:any)=>p.name?.toLowerCase()===match[2].toLowerCase()||p.name?.split(' ')[0].toLowerCase()===match[2].toLowerCase());
 if(!job||matches.length!==1)return null;
 let scheduled_for:string|undefined;
 if(match[3]){
  if(!job.scheduled_for)return {question:true as const};
  const today=localDate(Date.now(),timezone);
  const day=new Date(`${today}T12:00:00Z`);
  if(match[3].toLowerCase()==='tomorrow')day.setUTCDate(day.getUTCDate()+1);
  else if(match[3].toLowerCase().startsWith('on ')){
   const weekday=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(match[3].slice(3).toLowerCase());
   day.setUTCDate(day.getUTCDate()+((weekday-day.getUTCDay()+7)%7||7));
  }else day.setTime(Date.parse(`${match[3]}T12:00:00Z`));
  if(!Number.isFinite(day.getTime()))return {question:true as const};
  const parts=new Intl.DateTimeFormat('en',{timeZone:timezone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(job.scheduled_for));
  const hour=Number(parts.find(p=>p.type==='hour')?.value),minute=Number(parts.find(p=>p.type==='minute')?.value);
  const instant=scheduledInstant(day.toISOString().slice(0,10),timezone,hour);
  if(!instant)return {question:true as const};
  scheduled_for=new Date(Date.parse(instant)+minute*60000).toISOString();
 }
 return {call:{name:'assign_work_order',args:{id:job.id,assignee_id:matches[0].user_id??matches[0].id,updated_at:new Date(job.updated_at).toISOString(),...(scheduled_for?{scheduled_for}:{})}}};
}
/** Model calls must not silently discard a date in the request, including dates in another language. */
export const namesVisitDate=(question:string)=>/\btomorrow\b|\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b|\d{4}-\d{2}-\d{2}|باجر|بكرة|غدا|غداً|السبت|الأحد|الاثنين|الثلاثاء|الأربعاء|الخميس|الجمعة/i.test(question);
