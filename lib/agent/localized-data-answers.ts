import { choiceWords } from './choices';
import { callTool, type AgentContext } from './tools';
import { detectIntent, quickLookup, splitQuick, topClientsQuestion } from './data-answers';
import { formatInLang } from '../date-lang';
import { inWorkspace } from '../services/shared';
import { listWorkOrders } from '../services/work-orders';
import { statusLabels } from '../ui/work-orders';

/** Fixed file words around data. Never send names, job titles or site names for translation. */
export async function localizedDataAnswer(c: AgentContext, question: string, who: { language?: string | null; timezone?: string; tomorrow?: string; role?: string }): Promise<string | undefined> {
 const lang=who.language;
 if(!lang||lang==='en-IN'||lang==='en-GB')return undefined;
 const t=choiceWords(lang);
 const timezone=who.timezone??await inWorkspace(c.user,c.ws,async x=>(await x.db.query('SELECT timezone FROM workspaces WHERE id=$1',[c.ws])).rows[0]?.timezone??'Asia/Dubai');
 const date=(value:unknown)=>value?formatInLang(new Date(String(value).length===10?`${value}T12:00:00Z`:String(value)),{timeZone:String(value).length===10?'UTC':timezone,weekday:'short',day:'numeric',month:'short',...(String(value).length===10?{}:{hour:'2-digit',minute:'2-digit'})},lang,lang):'';
 const field=(key:string,value:unknown)=>`${t(key)}: ${value??''}`;
 const job=(j:any)=>[`• WO ${j.order_number}: ${j.title}`,j.site_name?field('Site',j.site_name):'',field('Status',t(statusLabels[j.status]??j.status)),j.scheduled_for?field('Visit',date(j.scheduled_for)):''].filter(Boolean).join('\n');
 const rows=(key:string,r:any)=>[field(key,r.total??r.data?.length??0),...(r.data??[]).map(job)].join('\n');
 const read=async(name:string,args:unknown={})=>{const result=await callTool(c,name,args);return result.isError?null:(result.structuredContent as any)?.result;};
 const named=splitQuick(question);
 const kind=quickLookup(question)??detectIntent(question).intent;
 if(who.role&&(['client_requests','client_visit'].includes(kind)&&who.role!=='client'||['today','next','free_tomorrow'].includes(kind)&&who.role==='client'))return undefined;
 if(named&&(kind==='late'||kind==='parts')){
  const match=await inWorkspace(c.user,c.ws,async x=>(await x.db.query(`SELECT id,'site' AS kind FROM sites WHERE workspace_id=$1 AND lower(name)=lower($2)
   UNION ALL SELECT id,'asset' FROM assets WHERE workspace_id=$1 AND lower(name)=lower($2)
   UNION ALL SELECT id,'job' FROM work_orders WHERE workspace_id=$1 AND lower(title)=lower($2)`,[c.ws,named.name])).rows);
  if(match.length!==1)return undefined;
  const params=new URLSearchParams({pageSize:'8',sort:'due_on',dir:'asc',[match[0].kind==='site'?'site_id':match[0].kind==='asset'?'asset_id':'id']:match[0].id});
  if(kind==='late')params.set('overdue','true');else params.append('status','waiting_on_parts');
  return rows(kind==='late'?'Late jobs':'Waiting for parts',await listWorkOrders(c.user,c.ws,params));
 }
 if(kind==='late'||kind==='parts'||kind==='client_requests'||kind==='client_visit'){
  const key=kind==='late'?'Late jobs':kind==='parts'?'Waiting for parts':kind==='client_requests'?'Open requests':'Visit';
  const r=await read('list_work_orders',{...(kind==='late'?{overdue:true}:{status:kind==='parts'?['waiting_on_parts']:kind==='client_visit'?['scheduled','in_progress']:['open','scheduled','in_progress','waiting_on_parts']}),sort:kind==='late'?'due_on':'scheduled_for',dir:'asc',pageSize:6});
  if(!r)return undefined;
  const waiting=kind==='client_requests'?await read('list_suggestions'):null;
  return rows(key,r)+(waiting?'\n'+field('Suggested jobs',(waiting.data??[]).filter((s:any)=>s.status==='pending').length):'');
 }
 if(kind==='today'||kind==='next'){
  const r=await read('my_day');if(!r)return undefined;
  const jobs=kind==='next'?[(r.today??[]).find((j:any)=>!['done','cancelled'].includes(j.status))??r.next?.[0]].filter(Boolean):r.today??[];
  return [field(kind==='next'?'Visit':'Today',jobs.length),...jobs.slice(0,6).map(job),field('Late jobs',r.late?.length??0),...(r.late??[]).slice(0,3).map(job),...(kind==='next'?[]:[field('Done',r.done??0)])].join('\n');
 }
 if(kind==='job'){
  const r=await read('get_work_order_by_number',{number:detectIntent(question).number});
  if(!r)return t('No matching job was found.');
  return [job({...r,site_name:r.site_name??r.site?.name}),r.assignee_name?field('Assigned to',r.assignee_name):'',r.due_on?field('Due date',date(r.due_on)):''].filter(Boolean).join('\n');
 }
 if(kind==='free_tomorrow'){
  if(!who.tomorrow)return undefined;
  const r=await read('get_schedule',{from:who.tomorrow,days:1});if(!r)return undefined;
  const away=new Set((r.away??[]).map((a:any)=>a.user_id));
  return [date(who.tomorrow),...(r.people??[]).filter((p:any)=>p.role==='technician').map((p:any)=>`${p.name}: ${away.has(p.user_id)?t('Away'):field('Jobs',(r.jobs??[]).filter((j:any)=>j.assignee_id===p.user_id).length)}`)].join('\n');
 }
 if(kind==='leave'){
  const r=await read('list_leave_requests');if(!r)return undefined;
  const list=Array.isArray(r)?r:[...(r.waiting??r.pending??[]),...(r.mine??[])];
  return [field('Time off requests',list.length),...list.slice(0,5).map((v:any)=>`• ${v.name??''}: ${date(v.starts_on)}${v.ends_on&&v.ends_on!==v.starts_on?' → '+date(v.ends_on):''} (${t(v.status==='pending'?'Waiting for review':v.status==='approved'?'Approved':'Declined')})`)].join('\n');
 }
 if(kind==='suggestions'){
  const r=await read('list_suggestions');if(!r)return undefined;
  return [field('Suggested jobs',(r.data??[]).filter((v:any)=>v.status==='pending').length),...(r.data??[]).slice(0,7).map((v:any)=>`• ${v.title}: ${t(v.status==='pending'?'Waiting for review':v.status==='approved'?'Accepted':'Declined')}${v.decline_reason?' ('+v.decline_reason+')':''}`)].join('\n');
 }
 if(topClientsQuestion(question)){
  const counts=await inWorkspace(c.user,c.ws,async x=>{
   if(!['admin','staff'].includes(x.role))return null;
   return (await x.db.query(`SELECT cl.name,count(*)::int AS n FROM work_orders w JOIN clients cl ON cl.id=w.client_id
    WHERE w.workspace_id=$1 AND w.created_at >= (date_trunc('month',now() AT TIME ZONE $2) AT TIME ZONE $2)
    GROUP BY cl.name ORDER BY n DESC,cl.name LIMIT 5`,[c.ws,timezone])).rows;
  });
  if(counts===null)return undefined;
  return [t('Clients')+': '+t('This month'),...counts.map((v:any)=>`• ${v.name}: ${field('Jobs',v.n)}`)].join('\n');
 }
 if(kind==='messages'){
  const r=await read('list_messages');if(!r)return undefined;
  const list=(r.data??r.threads??[]).filter((v:any)=>v.unread||v.unread_count);
  return [field('Unread messages',list.length),...list.slice(0,4).map((v:any)=>`• ${v.title??v.from_name??v.last_sender??t('Message')}${v.last_body?': '+String(v.last_body).slice(0,80):''}`)].join('\n');
 }
 if(kind==='attention'||kind==='summary'){
  const r=await read('needs_attention');if(!r)return undefined;
  return [field('Suggested jobs',r.suggested_jobs??0),field('Unread messages',r.unread_messages??0),field('Unread updates',r.unread_notifications??0),...(r.suggestions??[]).slice(0,3).map((v:any)=>`• ${v.title}${v.sender_name?': '+v.sender_name:''}`),...(r.notifications??[]).slice(0,3).map((v:any)=>`• ${v.title??v.body}`)].join('\n');
 }
 return undefined;
}
