import { equipmentKinds } from './assets';
/** Same words as the Job report screen. Kept here so client code never imports server code. */
const OUTCOME_LABELS={fixed:'Fixed',temporary:'Temporary fix',needs_part:'Needs a part',cant_fix:"Can't be fixed"} as const;
import { tradeLabels, type Trade } from '../trades';
import { formatDate } from '../dates';
import { readableLabel } from './polish';
import { clientStatusLabels, statusLabels } from './work-orders';
import { countryName, formatPhone, regionField } from '../countries/rules';

export function audienceStatusReply(value:string, client=false) {
 const labels=client?clientStatusLabels:statusLabels;
 const names=Object.keys(statusLabels).flatMap(status=>[status,statusLabels[status],clientStatusLabels[status]].map(name=>({name,status}))).sort((a,b)=>b.name.length-a.name.length);
 const escape=(name:string)=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const pattern=new RegExp(`\\b(?:${names.map(({name})=>escape(name)).join('|')})(?=$|\\W)`,'gi');
 // The friendly "Done, Kevin." opener is a word, not a job status: never turn it into Completed.
 const opener=/^Done(?=[,.!])/.test(value);
 const out=(opener?value.slice(4):value).replace(pattern,(name:string,offset:number,text:string)=>{
  const entry=names.find(entry=>entry.name.toLowerCase()===name.toLowerCase())!;
  const machineStatus=name===entry.status&&name.includes('_');
  const exactLabel=name===statusLabels[entry.status]||name===clientStatusLabels[entry.status];
  const statusContext=/\bstatus\s*(?::|is\b)\s*$/i.test(text.slice(0,offset));
  return machineStatus||exactLabel||statusContext?labels[entry.status]:name;
 });
 return opener?'Done'+out:out;
}
const uuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
/** Remove storage identifiers and translate machine words at the final reply boundary. */
export function plainAssistantReply(value: string, client=false) {
  value=value.replace(/\*\*([^*]+)\*\*|__([^_]+)__/g,(_,a,b)=>a??b).replace(/(?<!\w)_([^_\n]+)_(?!\w)/g,'$1').replace(/`([^`]+)`/g,'$1').replace(/^#{1,6}\s+/gm,'').replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g,'$1');
  const links: string[] = [];
  let text = value.replace(/\]\(\/work-orders\/[0-9a-f-]{36}\)/gi, link => { links.push(link);return `LINKPLACEHOLDER${links.length-1}END`; });
  // Job numbers read WO 1 everywhere, matching the app.
  text = text.replace(/\bWO[-\u2010\u2011\u2012 ]?(?=\d)/g, 'WO ');
  // No dashes in user facing copy: spaced en, em or plain dashes become commas.
  text = text.replace(/(\d)[^\S\n]*[\u2013\u2014][^\S\n]*(?=\d)/g, '$1 to ').replace(/[^\S\n]*[\u2013\u2014][^\S\n]*/g, ', ').replace(/(?<=\S)[^\S\n]+-[^\S\n]+(?=\S)/g, ', ');
  // Audit A18: model typography hyphens inside English words (leave‑request) read as a space, and request(s) reads requests.
  text = text.replace(/(?<=\p{L})[\u2010\u2011](?=\p{L})/gu, ' ').replace(/\b([A-Za-z]+)\(s\)/g, '$1s');
  // Role words mid sentence stay lower case (office staff, admin), never Office Staff or Admin.
  text = text.replace(/(?<=[a-z,] )(Admin|Supervisor|Technician|Staff|Client)\b/g, w => w.toLowerCase());
  text = text.replace(/\b(?:site|client|workspace|user|job|row)\s+ID\s*[:=]?\s*/gi, '')
    .replace(uuid, 'the linked record').replace(/\b[0-9a-f]{32,64}\b/gi,'the linked record').replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{0,4})?(?:…|\.{3})/gi,'the linked record')
    .replace(/\b(in_progress|waiting_on_parts|client_visible|internal_note|pending_approval|read_only)\b/g, word => statusLabels[word] ?? readableLabel(word))
    .replace(/\b(?:[a-z]+_)+(?:id|at|for|on)\b/g, word => readableLabel(word))
    .replace(/\b(?:list|get|update|create|add|approve|reject|set)_(?:[a-z]+_)*[a-z]+\b/g,'the workspace action')
    .replace(/there (?:is|are) no available tool[s]? to (?:modify|change) priority/gi,"I can’t change priority here. Open the job and use Edit.")
    .replace(/\btool(?:s)?\b/gi,'workspace action')
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/gi, word=>readableLabel(word.toLowerCase()))
    .replace(/\b[0-9a-f]{8}\b/gi,'the linked record')
    .replace(/LINKPLACEHOLDER(\d+)END/g,(_,index) => links[Number(index)]);
  return audienceStatusReply(text,client);
}
export const recordTools = ['create_client','update_client','create_site','update_site','add_asset'];
const recordLabels: Record<string,string> = { name:'Name', contact_name:'Main contact', phone:'Phone', email:'Email', billing_building:'Building', billing_street:'Street', billing_area:'Area', billing_city:'City', notes:'Notes', address:'Address', building:'Building name or number', area:'Area', access_notes:'Access notes', contact_phone:'Site contact phone' };
type RecordTarget = { label: string; record?: Record<string,any> | null; country?: string };
/** Labels that depend on the record's country: its region level. */
function recordLabel(tool: string, key: string, country?: string) {
  if (tool.endsWith('site') && key === 'contact_name') return 'Site contact';
  if (key === 'billing_region' || key === 'region') return regionField(country).label;
  if (key === 'country') return 'Country';
  return recordLabels[key] ?? readableLabel(key);
}
function recordValue(key: string, value: unknown, country?: string) {
  if (key === 'country') return value ? countryName(String(value)) : 'Same as workspace';
  if (value === null || value === undefined || value === '') return 'None';
  if (key === 'phone' || key === 'contact_phone') return formatPhone(String(value));
  return plainAssistantReply(String(value));
}
function recordLines(tool: string, args: Record<string,any>, previous?: Record<string,any> | null, country?: string) {
  return Object.entries(args).filter(([key, value]) => !['id','client_id'].includes(key) && value !== undefined && !(tool.startsWith('create') && (key === 'name' || value === null)))
    .map(([key, value]) => `${recordLabel(tool, key, country)}: ${previous ? `${recordValue(key, previous[key], country)} → ` : ''}${recordValue(key, value, country)}`).join('\n');
}
/** Confirmation card text for client and site writes. target is the record (update) or the client name (create site). */
export function recordSummary(tool: string, args: Record<string,any>, target?: RecordTarget) {
  if(tool==='add_asset')return `Add ${equipmentKinds[args.kind]??'equipment'} '${plainAssistantReply(args.name)}' at ${plainAssistantReply(target?.label??'this site')}`;
  const lines = recordLines(tool, args, tool.startsWith('update') ? target?.record : null, target?.country);
  const name = plainAssistantReply(target?.label ?? 'the selected record');
  if (tool === 'create_client') return `Add client “${plainAssistantReply(args.name)}”${lines ? `\n${lines}` : ''}`;
  if (tool === 'create_site') return `Add site “${plainAssistantReply(args.name)}” for ${name}${lines ? `\n${lines}` : ''}`;
  return `Update ${tool === 'update_site' ? 'site' : 'client'} ${name}:\n${lines || 'No changes'}`;
}
export function recordResult(tool: string, args: Record<string,any>, target?: { label: string }) {
  const name = plainAssistantReply(target?.label ?? 'the selected record');
  if(tool==='add_asset')return `Added ${plainAssistantReply(args.name)} at ${name}.`;
  if (tool === 'create_client') return `Added client ${plainAssistantReply(args.name)}.`;
  if (tool === 'create_site') return `Added site ${plainAssistantReply(args.name)} for ${name}.`;
  return `Updated ${tool === 'update_site' ? 'site' : 'client'} ${name}.`;
}
type Order = {id:string;order_number:number;title:string;status:string;priority:string;timezone?:string;due_on?:string|null;scheduled_for?:string|null};
function assistantTarget(order: Order) { return `WO ${order.order_number} ${plainAssistantReply(order.title)}`; }
const niceDay=(d:string)=>new Intl.DateTimeFormat('en',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(`${d}T00:00:00Z`));
/** Plain words for time off, like "Day off, Thursday 15 October". */
export const offSpan=(kind:string,from:string,to?:string)=>`${({off:'Day off',leave:'On leave',sick:'Sick'} as Record<string,string>)[kind]??'Time off'}, ${!to||to===from?niceDay(from):`${niceDay(from)} to ${niceDay(to)}`}`;
export function actionSummary(tool: string, args: Record<string,any>, order?: Order | null, target?: string, timezone?:string) {
  if(tool==='add_asset')return recordSummary(tool,args,{label:target??'this site'});
  if(tool==='cancel_visit')return `Cancel WO ${order?.order_number} ${order?.title}?`;
  if(tool==='reschedule_visit')return `Move WO ${order?.order_number} ${order?.title} to ${formatDate(args.scheduled_for,order?.timezone)}?`;
  if(tool === 'fill_onboarding') return 'Save these setup answers?\n'+Object.entries(args.answers??{}).map(([k,v])=>`${readableLabel(k)}: ${typeof v==='object'?JSON.stringify(v):v}`).join('\n');
  if(tool === 'suggest_contact_name') return `Save ${target??'this contact'} as ${args.nickname}?`;
  if(tool === 'remember_word') return `Remember this word?\n${args.phrase} means ${target??args.means_text??'the chosen '+args.means_kind}.\n${args.scope==='company'?'Company words':'Your words'}`;
  if(tool === 'forget_word') return `Remove this word?${target?'\n'+target:''}`;
  if(tool === 'remember_about_me') return `Remember this about you?\n${args.note}`;
  if(tool === 'forget_about_me') return 'Forget this note about you?';
  if(tool === 'set_call_me') return `Call you ${args.name} from now on?`;
  if(tool === 'ask_supervisor') return `Ask your supervisor?\n${args.question}${args.proposed?`\nMy suggestion: ${args.proposed}`:''}`;

  if(tool==='send_team_message')return `Send in Team space.\n${plainAssistantReply(args.body??'')}`;
  if(tool==='send_message')return `Send a message to ${plainAssistantReply(target??'this thread')}.\n${plainAssistantReply(args.body??'')}${args.photo_ids?.length?`\nPhotos: ${args.photo_ids.length}`:''}${args.work_order_id?`\nWho can read it: ${args.visibility==='internal'?'Team only':'Client and team'}`:''}`;
  if(tool==='suggest_job')return `Suggest ${plainAssistantReply(args.title)} for supervisor review.\n${plainAssistantReply(args.problem??'')}`;
  if(tool==='approve_suggestion')return `Approve ${plainAssistantReply(target??'this suggestion')} and create a job.${args.overrides?'\n'+Object.entries(args.overrides).map(([k,v])=>`${readableLabel(k)}: ${plainAssistantReply(String(v))}`).join('\n'):''}`;
  if(tool==='withdraw_request')return `Withdraw your request ${plainAssistantReply(target??'')}. The office will not see it any more.`;
  if(tool==='decline_suggestion')return `Decline ${plainAssistantReply(target??'this suggestion')}.\nReason: ${plainAssistantReply(args.reason)}`;
  const name = order ? assistantTarget(order) : plainAssistantReply(target ?? 'the selected row');
  if(tool==='report_price_change')return `Price changed: ${name}\n${plainAssistantReply(args.words)}\nWork is on hold until the client approves the price.`;
  if(tool==='report_client_refused')return `Client refused: ${name}\n${plainAssistantReply(args.words)}\nThe visit will close. The owner decides any visit charge.`;
  if(tool==='send_quote')return `Send a price of ${Number(args.amount).toLocaleString('en')} to the client for ${name}${args.note?`\n${plainAssistantReply(args.note)}`:''}\nThe client approves or declines it.`;
  if(tool==='answer_quote')return `${args.decision==='approved'?'Approve':'Decline'} the price for ${name}${order&&(order as any).quote_amount!=null?`: ${Number((order as any).quote_amount).toLocaleString('en')}`:''}`;
  if(tool==='confirm_visit')return `Confirm the visit time for ${name}${order?.scheduled_for?`: ${formatDate(order.scheduled_for,order.timezone)}`:''}`;
  if(tool==='request_time_off')return `Ask your supervisor for time off\n${offSpan(args.kind??'off',args.starts_on,args.ends_on)}\nIt waits until he says yes.`;
  if(tool==='decide_time_off')return `${args.decision==='approved'?'Approve':'Decline'} time off for ${plainAssistantReply(target??'this person')}`;
  if(tool==='tick_job_step')return `Checklist: ${name}\n${plainAssistantReply(args.step)}: ${args.done?'Done':'Not done'}`;
  if(tool==='add_job_material')return `Materials used: ${name}\nMaterial name: ${plainAssistantReply(args.name)}\nQuantity: ${args.quantity}${args.note?`\nNotes: ${plainAssistantReply(args.note)}`:''}`;
  if(tool==='save_job_report')return `Save the job report for ${name}\nHow it ended: ${OUTCOME_LABELS[args.outcome as keyof typeof OUTCOME_LABELS]}${args.problem?`\nProblem: ${plainAssistantReply(args.problem)}`:''}${args.work?`\nWhat you did: ${plainAssistantReply(args.work)}`:''}${args.outcome==='needs_part'?'\nThe job waits for the part.':args.outcome==='cant_fix'?'\nThe job stays open for your supervisor.':'\nThe job is marked done.'}`;
  if(tool==='add_comment')return `Add ${args.visibility==='internal'?'an internal note (team only)':'a comment visible to the client'} to ${name}:\n\n${plainAssistantReply(args.body)}`;
  if(tool==='update_work_order_status')return `Move ${name}: ${statusLabels[order!.status] ?? readableLabel(order!.status)} → ${statusLabels[args.status] ?? readableLabel(args.status)}`;
  if(tool==='assign_work_order')return `Assign ${name} to ${plainAssistantReply(target??'nobody')}${args.scheduled_for?`\nVisit: ${formatDate(args.scheduled_for,order?.timezone??timezone)} ${new Intl.DateTimeFormat('en-GB',{timeZone:order?.timezone??timezone??'Asia/Dubai',hour:'2-digit',minute:'2-digit'}).format(new Date(args.scheduled_for))}`:''}`;
  if(tool==='set_job_payment')return `Mark ${name} as ${({to_bill:'to bill',contract:'covered by the contract',paid:'paid'} as Record<string,string>)[args.payment_status]}${target?`\n${plainAssistantReply(target)}`:''}`;
  if(tool==='set_job_trade')return `Set the trade for ${name}: ${args.trade?tradeLabels[args.trade as Trade]:'Any'}`;
  if(tool==='set_worker_skills')return `Set what ${plainAssistantReply(target??'this person')} does:\nTrade: ${(args.trades??[]).map((t:Trade)=>tradeLabels[t]).join(', ')||'None'}\nArea: ${(args.areas??[]).map((a:string)=>plainAssistantReply(a)).join(', ')||'None'}`;
  if(tool==='set_approval_mode')return args.approval_mode==='every'?'Ask before every change, notes too':'Ask before important changes only. Simple team notes are saved straight away';
  if(tool==='set_member_roles')return `Give ${plainAssistantReply(target??"this person")} these roles, ${(args.roles??[]).map((r:string)=>({owner:'Owner',manager:'Manager',office:'Office staff',admin:'Admin',staff:'Supervisor',technician:'Technician',client:'Facility manager'} as Record<string,string>)[r]??r).join(', ')}`;
  if(tool==='rename_role')return args.name?`Call the ${({owner:'Owner',manager:'Manager',office:'Office staff',admin:'Admin',staff:'Supervisor',technician:'Technician',client:'Facility manager'} as Record<string,string>)[args.role]} role ${plainAssistantReply(args.name)}`:`Put back the standard name for the ${({owner:'Owner',manager:'Manager',office:'Office staff',admin:'Admin',staff:'Supervisor',technician:'Technician',client:'Facility manager'} as Record<string,string>)[args.role]} role`;
  if(tool==='add_worker')return `Add ${plainAssistantReply(args.name)} to the team as ${args.role==='staff'?'a supervisor':'a technician'}${args.phone?`\nPhone: ${plainAssistantReply(args.phone)}`:''}`;
  if(tool==='set_priority')return `Change priority for ${name}: ${readableLabel(order!.priority)} → ${readableLabel(args.priority)}`;
  if(tool==='update_work_order_dates')return `Change dates for ${name}:\n${['due_on','scheduled_for'].filter(key=>key in args).map(key=>`${key==='due_on'?'Due date':'Visit'}: ${order?.[key as 'due_on'|'scheduled_for']?formatDate(order[key as 'due_on'|'scheduled_for']!,order.timezone):'None'} → ${args[key]?formatDate(args[key],order?.timezone):'None'}`).join('\n')}`;
  if(tool==='create_request')return `Create request “${plainAssistantReply(args.title)}” at ${plainAssistantReply(target??'the selected site')}\nPriority: ${readableLabel(args.priority??'normal')}${args.same_technician?'\nAsk for the same technician as last time.':''}${args.preferred_window?`\nBest time for the visit: ${plainAssistantReply(args.preferred_window)}`:''}${args.description?`\n\n${plainAssistantReply(args.description)}`:''}${args.due_on?`\nDue: ${formatDate(args.due_on,timezone)}`:''}${args.scheduled_for?`\nVisit: ${formatDate(args.scheduled_for,timezone)}`:''}`;
  if(tool==='approve_queue_row')return `Approve ${name}${args.edits?` with these corrections:\n${Object.entries(args.edits).map(([k,v])=>`${readableLabel(k)}: ${plainAssistantReply(String(v))}`).join('\n')}` : ''}`;
  return `Reject ${name}:\n\n${plainAssistantReply(args.reason??'')}`;
}
export function actionResult(tool: string, args: Record<string,any>, order?: Order | null, target?: string) {
  if(tool==='cancel_visit')return 'Your job is cancelled. The technician and supervisors have been notified.';
  if(tool==='reschedule_visit')return 'Your visit has moved. The technician and supervisors have been notified.';
  if(tool==='suggest_contact_name')return `Saved this contact as ${args.nickname} for you only.`;
  if(tool==='fill_onboarding')return 'Your setup answers are saved. Review them on the setup screen.';
  if(tool==='send_team_message')return 'Your message was sent in Team space.';
  if(tool==='send_message')return 'Your message was sent. The reader gets a notification.';
  if(tool==='suggest_job')return 'Sent your suggested job for review.';
  if(tool==='approve_suggestion')return 'Accepted the suggestion and created its job. The sender gets a message.';
  if(tool==='withdraw_request')return 'Your request is withdrawn.';
  if(tool==='decline_suggestion')return `The request was not accepted. The sender gets this reason: ${plainAssistantReply(args.reason)}`;
  if(tool==='create_request'&&order&&!(order as any).order_number)return 'Request Received. Your service company will review it.';
  if(tool==='set_worker_skills')return plainAssistantReply(`Saved what ${target??'this person'} does.`);
  if(tool==='set_approval_mode')return args.approval_mode==='every'?'I will ask before every change from now on.':'I will ask before important changes and save simple notes straight away.';
  if(tool==='set_member_roles')return plainAssistantReply(`Saved the roles of ${target??'this person'}.`);
  if(tool==='rename_role')return args.name?plainAssistantReply(`The ${({owner:'Owner',manager:'Manager',office:'Office staff',admin:'Admin',staff:'Supervisor',technician:'Technician',client:'Facility manager'} as Record<string,string>)[args.role]} role is now called ${args.name}.`):`The ${({owner:'Owner',manager:'Manager',office:'Office staff',admin:'Admin',staff:'Supervisor',technician:'Technician',client:'Facility manager'} as Record<string,string>)[args.role]} role has its standard name again.`;
  if(tool==='add_worker')return plainAssistantReply(`Added ${args.name}. Open Team and tap New sign in to make a code.`);
  if(tool==='request_time_off')return `Sent your time off request: ${offSpan(args.kind??'off',args.starts_on,args.ends_on)}. I will tell you when your supervisor answers.`;
  if(tool==='decide_time_off')return args.decision==='approved'?'Approved. It shows on the schedule now.':'Declined. He gets a message.';
  if(tool==='remember_word')return 'Word saved. You can see it on your Memory page.';
  if(tool==='forget_word')return 'Word removed.';
  if(tool==='remember_about_me')return 'Saved. You can see it on your Memory page.';
  if(tool==='forget_about_me')return 'Forgotten. I will not use it again.';
  if(tool==='set_call_me')return 'I will call you that from now on.';
  if(tool==='ask_supervisor')return 'Sent to your supervisor. Nothing changes until they answer. I will tell you when they do.';
  if(!order)return plainAssistantReply(tool==='reject_queue_row'?`Rejected ${target??'the selected row'}: ${args.reason}`:`Updated ${target??'the selected row'}.`);
  const name=assistantTarget(order).replace(/[\[\]\r\n]/g,' '),link=`[${name}](/work-orders/${order.id})`;
  if(tool==='update_work_order_status')return `Moved ${link} to ${statusLabels[args.status] ?? readableLabel(args.status)}.`;
  if(tool==='assign_work_order')return `Assigned ${link} to ${plainAssistantReply(target??'nobody')}.`;
  if(tool==='set_job_payment')return `Marked ${link} as ${({to_bill:'to bill',contract:'covered by the contract',paid:'paid'} as Record<string,string>)[args.payment_status]}.`;
  if(tool==='set_job_trade')return `Set the trade for ${link} to ${args.trade?tradeLabels[args.trade as Trade]:'Any'}.`;
  if(tool==='set_priority')return `Changed priority for ${link} to ${readableLabel(args.priority)}.`;
  if(tool==='report_price_change')return `Price changed. Work is on hold until the client approves the price. ${link}`;
  if(tool==='report_client_refused')return `Client refused. The visit is closed. ${link}`;
  if(tool==='send_quote')return `Sent the price for ${link}. I will tell you when the client answers.`;
  if(tool==='answer_quote')return args.decision==='approved'?`Approved the price for ${link}. The team can go ahead.`:`Declined the price for ${link}. The team will be in touch.`;
  if(tool==='confirm_visit')return `Confirmed the visit time for ${link}.`;
  if(tool==='tick_job_step'||tool==='add_job_material')return `Checklist and materials saved. ${link}`;
  if(tool==='save_job_report')return args.outcome==='needs_part'?`Saved the report on ${link}. It now waits for the part.`:args.outcome==='cant_fix'?`Saved the report on ${link}. Your supervisor will see it.`:`Saved the report on ${link}. Job done, well done.`;
  if(tool==='add_comment')return `Added ${args.visibility==='internal'?'an internal note':'a comment visible to the client'} to ${link}.\n\n${plainAssistantReply(args.body)}`;
  if(tool==='update_work_order_dates')return `Updated dates for ${link}.\n${actionSummary(tool,args,order).split('\n').slice(1).join('\n')}`;
  return `Created ${link}.`;
}

/** Money always carries its currency: "a quote of 850.00" becomes "a quote of AED 850.00". */
export function withCurrency(text:string,currency='AED'){
  const code=currency.toUpperCase();
  return text.replace(/(^|[^\w.,])((?:AED|USD|SAR|QAR|KWD|BHD|OMR|EUR|GBP|INR|Dhs?|\$)\s?)?(\d{1,3}(?:,\d{3})*|\d+)\.(\d{2})(?![\d%]|\.\d)(\s?(?:AED|USD|SAR|QAR|KWD|BHD|OMR|dirhams?))?/gi,(m,pre,cur,whole,dec,post)=>cur||post?m:`${pre}${code} ${whole}.${dec}`);
}
