import { notificationTemplates } from '../ui/notifications';
import { redactTenantContacts, checkTenantInput, normalizeTenant, tenantValues } from './tenant';
import { sendPush } from './push';
import { detectEmergency, isFalseAlarm, SAFETY } from '../emergency';
import { withSystem } from '../db';
import { hash, inWorkspace } from './shared';

type Intake = { site_id?: string | null; work_order_id?: string | null; title?: string; prepareCard?: boolean; tenant?: {tenant_unit?:string|null;tenant_name?:string|null;tenant_phone?:string|null} };
/** Safety intake commits independently of AI and of any later booking confirmation. */
export async function reportEmergency(user: string, ws: string, words: string, intake: Intake = {}) {
 const kind = detectEmergency(words), falseAlarm = isFalseAlarm(words);
 if (!kind && !falseAlarm) return null;
 // Resolve only records the sender can see before using the privileged notification writer.
 const context = await inWorkspace(user, ws, async c => {
  checkTenantInput(c,intake.tenant);
  const sites = (await c.db.query('SELECT id,client_id,name FROM sites WHERE workspace_id=$1 AND archived_at IS NULL ORDER BY id', [ws])).rows;
  const number = words.match(/\bWO\s*(\d+)\b/i)?.[1];
  const job = intake.work_order_id || number ? (await c.db.query('SELECT id,site_id,assignee_id FROM work_orders WHERE workspace_id=$1 AND (id=$2 OR order_number=$3)', [ws, intake.work_order_id ?? null, number ? Number(number) : null])).rows[0] : null;
  const site = sites.find(s => s.id === (intake.site_id ?? job?.site_id)) ?? sites.find(s => words.toLowerCase().includes(String(s.name).toLowerCase())) ?? (sites.length === 1 ? sites[0] : null);
  return { client_kind:c.client_kind,role: c.role, client: c.client_id, site, job };
 });
 const tenant=normalizeTenant(tenantValues(intake.tenant??{}));
 const result = await withSystem(async db => {
  const scope = `${ws}/emergencies`, key = kind ?? 'falseAlarm';
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [JSON.stringify([scope, user, key])]);
  const previous = (await db.query("SELECT result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key=$3 AND created_at + interval '10 minutes'>now()", [user, scope, key])).rows[0]?.result;
  if (previous) {
   if (context.job && !previous.job && intake.prepareCard === false) {
    await db.query("UPDATE notifications SET entity='work_orders',entity_id=$3 WHERE workspace_id=$1 AND id=ANY($2::uuid[])", [ws,previous.notificationIds??[],context.job.id]);
    previous.job=context.job;
    await db.query('UPDATE idempotency_keys SET result=$4 WHERE user_id=$1 AND scope=$2 AND key=$3', [user,scope,key,JSON.stringify(previous)]);
   }
   return { ...previous, duplicate: true };
  }
  const who = String((await db.query('SELECT name FROM users WHERE id=$1', [user])).rows[0]?.name ?? 'Team member');
  let job = context.job, request: Record<string, any> | null = null;
  if (falseAlarm) {
   const last = (await db.query('SELECT result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key<>$3 ORDER BY created_at DESC LIMIT 1', [user, scope, key])).rows[0]?.result;
   job ??= last?.job ?? null;
   request = last?.request ?? null;
  } else if (context.role === 'client' && kind !== 'people' && !job) {
   const trade = kind === 'flood' ? 'plumbing' : kind === 'electric' ? 'electrical' : 'general';
   if (context.site) {
    request = (await db.query("INSERT INTO work_orders(workspace_id,client_id,site_id,title,description,priority,trade,source,created_by,tenant_unit,tenant_name,tenant_phone) VALUES($1,$2,$3,$4,$5,'urgent',$6,'client',$7,$8,$9,$10) RETURNING *", [ws, context.client, context.site.id, intake.title ?? words.slice(0,200), words, trade, user,tenant.tenant_unit??null,tenant.tenant_name??null,tenant.tenant_phone??null])).rows[0];
    job = request;
   } else {
    // A request can arrive before its site is known. The supervisor resolves its location.
    request = (await db.query("INSERT INTO job_suggestions(workspace_id,client_id,title,problem,priority,source,sender_user_id,sender_name,tenant_unit,tenant_name,tenant_phone) VALUES($1,$2,$3,$4,'urgent',CASE WHEN $5='household' THEN 'household' ELSE 'client' END,$6,$7,$8,$9,$10) RETURNING *", [ws, context.client, intake.title ?? words.slice(0,200), words, (await db.query('SELECT client_kind FROM members WHERE workspace_id=$1 AND user_id=$2',[ws,user])).rows[0]?.client_kind, user, who,tenant.tenant_unit??null,tenant.tenant_name??null,tenant.tenant_phone??null])).rows[0];
   }
  }
  const message = falseAlarm ? `${who} reported a false alarm. Should the emergency job be cancelled? He said: ${words.slice(0,140)}` : `Emergency reported by ${who}: ${words.slice(0,140)}`;
  const recipients = (await db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND (role='admin' OR (role='staff' AND staff_kind IS NULL) OR user_id=$2)", [ws, falseAlarm ? null : job?.assignee_id ?? null])).rows;
  // Emergency delivery includes the reporter. Self notices are system delivered because
  // the shared notification trigger suppresses notices whose actor is the recipient.
  await db.query("SELECT set_config('app.user_id','',true)");
  const notificationIds:string[]=[];
  for (const recipient of recipients) {
   const notice=await db.query('INSERT INTO notifications(user_id,workspace_id,kind,entity,entity_id,actor_id,actor_name,work_order_title,message_template) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) RETURNING id', [recipient.user_id, ws, falseAlarm ? 'emergency_review' : 'emergency', job ? 'work_orders' : request ? 'job_suggestions' : 'emergencies', job?.id ?? request?.id ?? null, recipient.user_id === user ? null : user, who, message, JSON.stringify({key:notificationTemplates[falseAlarm?'emergency_review':'emergency'],values:{name:who,words:words.slice(0,140)}})]);
   notificationIds.push(notice.rows[0].id);
  }
  await db.query("SELECT set_config('app.user_id',$1,true)", [user]);
  const reply = falseAlarm ? 'I will let the supervisor decide whether to cancel the emergency job. I sent him your message.' : `${SAFETY[kind!]}\n\n${context.role === 'client' && kind !== 'people' && request ? 'Your urgent request was sent to the supervisor.' : 'The emergency alert was sent to the supervisors and admins.'}`;
  let pending_action;
  if (intake.prepareCard !== false && !falseAlarm && kind !== 'people' && context.role !== 'client' && (job || context.site)) {
   const tool = context.role === 'technician' ? 'suggest_job' : job ? 'set_priority' : 'create_request';
   const args = tool === 'set_priority' ? { id: job.id, priority: 'urgent' } : { title: words.slice(0,200), [tool === 'suggest_job' ? 'problem' : 'description']: words, site_id: job?.site_id ?? context.site?.id, priority: 'urgent', ...(tool === 'create_request' ? { trade: kind === 'flood' ? 'plumbing' : kind === 'electric' ? 'electrical' : 'general' } : {}) };
   const summary = tool === 'set_priority' ? 'Make this job urgent.' : 'Create an urgent request with your message.';
   const why = 'The alert has already been sent. Confirm to save the job change.';
   const id = (await db.query('INSERT INTO assistant_actions(workspace_id,user_id,tool,args,summary,why) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [ws,user,tool,JSON.stringify(args),summary,why])).rows[0].id;
   pending_action = { id, tool, args, summary, why };
  }
  const result = { notificationIds, recipients: recipients.map(r => String(r.user_id)), notification: message, available: true, emergency: true, reply: reply + (!falseAlarm && context.role !== 'client' && kind !== 'people' && !pending_action && intake.prepareCard !== false ? '\n\nTell me the site or WO number to prepare the job card.' : ''), ...(pending_action ? {pending_action} : {}), job, request, kind };
  await db.query('INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id,scope,key) DO UPDATE SET result=excluded.result,fingerprint=excluded.fingerprint,created_at=now()', [user,scope,key,hash(words),JSON.stringify(result)]);
  return result;
 }, user);
 if (!result.duplicate) await sendPush(result.recipients, { title: falseAlarm ? 'Emergency review' : 'Emergency', body: result.notification, url: result.job ? `/work-orders/${result.job.id}` : '/home', tag: `emergency:${user}:${kind ?? 'review'}`, urgent: true });
 const {recipients:_recipients,notification:_notification,notificationIds:_notificationIds,...visible}=result;
 return redactTenantContacts(context,visible);
}

