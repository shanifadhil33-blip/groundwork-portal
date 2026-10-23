import type { PoolClient } from 'pg';
import { z } from 'zod';
import { withSystem, withUser } from '../db';
import { ApiError, forbidden, missing } from '../http';
import { openSealed } from '../secret-box';
import { uuid } from './shared';
import { getRating } from './ratings';

const deletionScope = (ws: string) => `sec07:delete:${ws}`;
const confirmSchema = z.object({ confirm: z.literal(true) }).strict();
// Owner connections are necessary for request receipts and credential removal.
// Every entry point checks the authenticated membership inside that transaction.
async function membership(db: PoolClient, user: string, ws: string, admin = false) {
  uuid.parse(ws);
  const m = (await db.query(`SELECT m.*,w.is_demo,w.demo_expires_at FROM members m JOIN workspaces w ON w.id=m.workspace_id
    JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.workspace_id=$2 AND m.archived_at IS NULL
    AND (NOT w.is_demo AND NOT u.is_demo OR w.is_demo AND u.is_demo AND u.demo_workspace_id=w.id AND w.demo_expires_at>now())`, [user, ws])).rows[0];
  if (!m) throw missing();
  if (admin && m.role !== 'admin' && !m.is_owner) throw forbidden();
  return m;
}

/** Allowlisted fields deliberately exclude contacts, other people's reports and cached snapshots. */
export async function exportPersonalData(user: string, workspace?: string) {
  return withSystem(async db => {
    if (workspace) await membership(db, user, workspace);
    const profile = (await db.query('SELECT id,name,email,image,phone FROM users WHERE id=$1', [user])).rows[0];
    if (!profile) throw missing();
    profile.phone = openSealed(profile.phone, process.env.AUTH_SECRET);
    const preferences = (await db.query('SELECT * FROM user_preferences WHERE user_id=$1', [user])).rows[0] ?? {};
    const memberships = (await db.query(`SELECT m.workspace_id,m.role,m.is_owner FROM members m JOIN workspaces w ON w.id=m.workspace_id
      WHERE m.user_id=$1 AND m.archived_at IS NULL AND ($2::uuid IS NULL OR m.workspace_id=$2)
      AND (NOT w.is_demo OR w.demo_expires_at>now()) ORDER BY m.workspace_id`, [user, workspace ?? null])).rows;
    const companies = [];
    for (const m of memberships) {
      const ws = m.workspace_id;
      await membership(db, user, ws);
      const jobs = (await db.query(`SELECT id,order_number,title,status,priority,scheduled_for,created_at,updated_at,
        created_by=$2 AS created_by_me,assignee_id=$2 AS assigned_to_me FROM work_orders
        WHERE workspace_id=$1 AND (created_by=$2 OR assignee_id=$2) ORDER BY created_at,id`, [ws, user])).rows;
      const comments = (await db.query(`SELECT id,work_order_id,body,visibility,voice_note_text,created_at FROM comments
        WHERE workspace_id=$1 AND author_id=$2 ORDER BY created_at,id`, [ws, user])).rows;
      const reports = (await db.query(`SELECT id AS work_order_id,report_problem,report_work,report_outcome,report_at
        FROM work_orders WHERE workspace_id=$1 AND report_by=$2 ORDER BY id`, [ws, user])).rows;
      const leave = (await db.query('SELECT id,kind,starts_on,ends_on,note,status,created_at FROM time_off WHERE workspace_id=$1 AND user_id=$2 ORDER BY starts_on,id', [ws, user])).rows;
      const learning = (await db.query('SELECT body,created_at FROM personal_agent_learning WHERE workspace_id=$1 AND user_id=$2 ORDER BY created_at,id', [ws, user])).rows;
      const channel = (await db.query(`SELECT id,phone_sealed,body_sealed,voice_sealed,direction,kind,created_at FROM whatsapp_messages
        WHERE workspace_id=$1 AND user_id=$2 AND kind<>'code' ORDER BY created_at,id`, [ws, user])).rows.map(r => ({
          id:r.id, phone:openSealed(r.phone_sealed, process.env.AUTH_SECRET), body:openSealed(r.body_sealed, process.env.AUTH_SECRET),
          voice_note:openSealed(r.voice_sealed, process.env.AUTH_SECRET), direction:r.direction, kind:r.kind, created_at:r.created_at,
        }));
      const ratings = [];
      const visible = new Set((await withUser(user, app => app.query('SELECT id FROM work_orders WHERE workspace_id=$1 AND (created_by=$2 OR assignee_id=$2)', [ws,user]))).rows.map(r => r.id));
      for (const job of jobs) {
        if (!visible.has(job.id)) continue;
        const { rating } = await getRating(user, ws, job.id);
        if (rating) ratings.push({ work_order_id:job.id, ...rating });
      }
      companies.push({ workspace_id:ws, membership:m, jobs, comments, reports, leave, ratings, learning, channel });
    }
    return { version:1, exported_at:new Date().toISOString(), scope:'personal', profile, preferences, companies };
  }, user);
}

// Company records, never personal preferences, private conversations, personal Agent learning,
// authentication material, sign in capabilities or encrypted channel payloads.
const companyTables = ['clients','sites','assets','members','work_orders','comments','work_order_events',
  'job_ratings','time_off','job_suggestions','supplier_orders','supplier_events','company_rules',
  'company_documents','draft_invoices','job_prechecks','imports','import_rows','workspace_money',
  'job_visits','work_order_counters','supplier_sync_runs'] as const;
export async function exportCompanyData(user: string, ws: string) {
  return withSystem(async db => {
    await membership(db, user, ws, true);
    const company = (await db.query('SELECT * FROM workspaces WHERE id=$1', [ws])).rows[0];
    const records: Record<string, unknown[]> = {};
    for (const table of companyTables) {
      // Identifiers come exclusively from the static list above. No supplied table or column names.
      records[table] = (await db.query(`SELECT to_jsonb(t)-ARRAY['phone_sealed','body_sealed','voice_sealed','token_hash','code_hash','bytes'] AS record
        FROM ${table} t WHERE workspace_id=$1 ORDER BY to_jsonb(t)->>'id'`, [ws])).rows.map(r => r.record);
    }
    for (const table of ['company_documents','job_photos'] as const) {
      records[table] = (await db.query(`SELECT to_jsonb(t)-'bytes'||jsonb_build_object('bytes_base64',encode(bytes,'base64')) AS record
        FROM ${table} t WHERE workspace_id=$1 ORDER BY id`, [ws])).rows.map(r => r.record);
    }
    records.shared_photos = (await db.query(`SELECT to_jsonb(t)-'bytes'||jsonb_build_object('bytes_base64',encode(bytes,'base64')) AS record
      FROM shared_photos t WHERE workspace_id=$1 AND (suggestion_id IS NOT NULL OR work_order_id IS NOT NULL) AND conversation_id IS NULL ORDER BY id`, [ws])).rows.map(r => r.record);
    records.audit = (await db.query('SELECT id,actor_id,action,entity,entity_id,at FROM audit_log WHERE workspace_id=$1 ORDER BY at,id', [ws])).rows;
    records.people = (await db.query(`SELECT u.id,u.name,m.role,m.archived_at FROM users u JOIN members m ON m.user_id=u.id
      WHERE m.workspace_id=$1 ORDER BY u.id`, [ws])).rows;
    return { version:1, exported_at:new Date().toISOString(), scope:'company', company, records };
  }, user);
}

export async function deletionRequests(user: string, ws: string) {
  return withSystem(async db => {
    const m = await membership(db, user, ws);
    const admin = m.role === 'admin' || m.is_owner;
    const requests = (await db.query(`SELECT k.user_id,u.name,k.created_at,k.result->>'status' AS status
      FROM idempotency_keys k JOIN users u ON u.id=k.user_id
      JOIN members target ON target.user_id=k.user_id AND target.workspace_id=$1
      WHERE k.scope=$2 AND k.key='request' AND ($3 OR k.user_id=$4) ORDER BY k.created_at,k.user_id`,
      [ws, deletionScope(ws), admin, user])).rows;
    return { requests, practice:!!m.is_demo };
  }, user);
}

export async function requestAccountDeletion(user: string, ws: string, body: unknown) {
  confirmSchema.parse(body);
  return withSystem(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['sec07:'+user]);
    const m = await membership(db, user, ws);
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [user]);
    const memberships = (await db.query('SELECT workspace_id,is_owner FROM members WHERE user_id=$1 AND archived_at IS NULL FOR UPDATE', [user])).rows;
    if (memberships.some(row => row.is_owner)) throw new ApiError(409, 'owner_required', 'Choose another owner or close your company before asking to delete your account.');
    for (const row of memberships) {
      await db.query(`INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,$2,'request','sec07', $3)
        ON CONFLICT(user_id,scope,key) DO NOTHING`, [user, deletionScope(row.workspace_id), JSON.stringify({ status:'pending', practice:!!m.is_demo })]);
    }
    return { requested:true, practice:!!m.is_demo };
  }, user);
}

async function anonymiseAccount(db: PoolClient, user: string) {
  const identity = (await db.query('SELECT name,email,phone FROM users WHERE id=$1 FOR UPDATE', [user])).rows[0];
  // Remove private content and credentials, retain foreign keys used by company job history.
  for (const table of ['sessions','accounts']) await db.query(`DELETE FROM ${table} WHERE "userId"=$1`, [user]);
  for (const table of ['login_links','phone_changes','push_subscriptions','personal_agent_learning','assistant_actions',
    'message_reads','message_translations','user_preferences','onboarding_progress','onboarding_actions']) {
    await db.query(`DELETE FROM ${table} WHERE user_id=$1`, [user]);
  }
  await db.query("DELETE FROM lesson_proposals WHERE proposed_by=$1 AND scope='personal'", [user]);
  await db.query("UPDATE lesson_proposals SET proposed_by_name='Deleted person' WHERE proposed_by=$1", [user]);
  await db.query('DELETE FROM join_requests WHERE user_id=$1', [user]);
  await db.query('DELETE FROM agent_questions WHERE asked_by=$1', [user]);
  await db.query('DELETE FROM verification_token WHERE identifier=$1', [identity.email]);
  await db.query('DELETE FROM whatsapp_messages WHERE user_id=$1', [user]);
  await db.query('DELETE FROM contact_nicknames WHERE owner_user_id=$1 OR target_user_id=$1', [user]);
  await db.query('DELETE FROM agent_words WHERE user_id=$1', [user]);
  await db.query('DELETE FROM api_tokens WHERE user_id=$1', [user]);
  await db.query('DELETE FROM notifications WHERE user_id=$1', [user]);
  await db.query('DELETE FROM messages WHERE sender_id=$1', [user]);
  await db.query("DELETE FROM conversations WHERE kind='direct' AND $1=ANY(participants)", [user]);
  await db.query('DELETE FROM shared_photos WHERE uploaded_by=$1 AND suggestion_id IS NULL AND work_order_id IS NULL', [user]);
  await db.query("UPDATE comments SET author_name='Deleted person',voice_note_text=NULL WHERE author_id=$1", [user]);
  await db.query("UPDATE job_suggestions SET sender_name='Deleted person',sender_phone=NULL,tenant_name=NULL,tenant_phone=NULL,voice_note_text=NULL WHERE sender_user_id=$1", [user]);
  await db.query("UPDATE work_orders SET tenant_name=NULL,tenant_phone=NULL WHERE created_by=$1", [user]);
  await db.query("UPDATE notifications SET actor_name='Deleted person' WHERE actor_id=$1", [user]);
  await db.query('UPDATE time_off SET note=NULL WHERE user_id=$1', [user]);
  await db.query("UPDATE work_order_events SET body='Assigned Deleted person',details=details||'{\"assignee_name\":\"Deleted person\"}'::jsonb WHERE kind='assignment_changed' AND details->>'assignee_name'=$2 AND workspace_id IN (SELECT workspace_id FROM members WHERE user_id=$1)", [user,identity.name]);
  await db.query("UPDATE users SET name='Deleted person',email=NULL,image=NULL,phone=NULL,\"emailVerified\"=NULL WHERE id=$1", [user]);
  await db.query('UPDATE members SET archived_at=coalesce(archived_at,now()),is_owner=false WHERE user_id=$1', [user]);
  // Auditing the scrubbing above can itself copy the old values. Remove such snapshots last.
  await db.query(`UPDATE audit_log SET "before"=NULL,"after"=NULL WHERE actor_id=$1 OR entity_id=$1
    OR strpos(coalesce("before"::text,''),$1::text)>0 OR strpos(coalesce("after"::text,''),$1::text)>0
    OR (workspace_id IN (SELECT workspace_id FROM members WHERE user_id=$1) AND
      EXISTS(SELECT 1 FROM unnest($2::text[]) value WHERE value<>'' AND
        (strpos(coalesce("before"::text,''),value)>0 OR strpos(coalesce("after"::text,''),value)>0)))`,
    [user, [identity.name, identity.email, identity.phone].filter(Boolean)]);
  await db.query("DELETE FROM idempotency_keys WHERE user_id=$1 AND scope NOT LIKE 'sec07:delete:%'", [user]);
}

export async function handleAccountDeletion(user: string, ws: string, target: string, body: unknown) {
  confirmSchema.parse(body); uuid.parse(target);
  return withSystem(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['sec07:'+target]);
    const actor = await membership(db, user, ws, true);
    await db.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [target]);
    const request = (await db.query("SELECT result FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key='request' FOR UPDATE", [target, deletionScope(ws)])).rows[0];
    if (!request) throw missing();
    if (request.result.status === 'completed') return { completed:true, practice:!!actor.is_demo };
    const targetMemberships = (await db.query('SELECT workspace_id,is_owner FROM members WHERE user_id=$1 AND archived_at IS NULL FOR UPDATE', [target])).rows;
    if (!targetMemberships.some(m => m.workspace_id === ws)) throw missing();
    if (targetMemberships.some(m => m.is_owner)) throw new ApiError(409, 'owner_required', 'Choose another owner or close your company before asking to delete your account.');
    await db.query("UPDATE idempotency_keys SET result=result||'{\"status\":\"approved\"}'::jsonb WHERE user_id=$1 AND scope=$2 AND key='request'", [target, deletionScope(ws)]);
    for (const m of targetMemberships) {
      const approved = (await db.query("SELECT 1 FROM idempotency_keys WHERE user_id=$1 AND scope=$2 AND key='request' AND result->>'status'='approved'", [target, deletionScope(m.workspace_id)])).rowCount;
      if (!approved) return { completed:false, practice:!!actor.is_demo };
    }
    // Practice changes receipts only. No profile, session, membership or job is touched.
    if (!actor.is_demo) await anonymiseAccount(db, target);
    await db.query("UPDATE idempotency_keys SET result=result||'{\"status\":\"completed\"}'::jsonb WHERE user_id=$1 AND scope LIKE 'sec07:delete:%' AND key='request'", [target]);
    return { completed:true, practice:!!actor.is_demo, preview:{ name:'Deleted person', sign_in_disabled:true, job_history_kept:true } };
  }, user);
}

/** Called only by the existing authenticated cron, never exposed as a public mutation. */
export async function cleanupPersonalData() {
  return withSystem(async db => {
    const counts: Record<string, number> = {};
    for (const [table, condition] of [
      ['login_links', 'expires_at<now()'], ['phone_changes', 'expires_at<now()'],
      ['verification_token', 'expires<now()'], ['sessions', 'expires<now()'],
      ['login_attempts', "created_at<now()-interval '1 day'"],
      ['notifications', "read_at IS NOT NULL AND created_at<now()-interval '90 days'"],
    ]) counts[table] = (await db.query(`DELETE FROM ${table} WHERE ${condition}`)).rowCount ?? 0;
    return counts;
  });
}

export async function closeCompanyForPrivacy(user: string, ws: string, body: unknown) {
  confirmSchema.parse(body);
  return withSystem(async db => {
    const m = await membership(db, user, ws, true);
    if (!m.is_owner) throw forbidden();
    if (m.is_demo) return { closed:true, practice:true };
    // The existing definer function checks my_role and deletes company records in FK order.
    await db.query('SELECT delete_workspace($1)', [ws]);
    await db.query('DELETE FROM idempotency_keys WHERE strpos(scope,$1)>0 OR strpos(result::text,$1)>0', [ws]);
    await db.query('DELETE FROM audit_log WHERE workspace_id=$1', [ws]);
    return { closed:true, practice:false };
  }, user);
}

/** A signed in person without active memberships has no company approver. */
export async function requestMyAccountDeletion(user: string, body: unknown) {
  confirmSchema.parse(body);
  const first = await withSystem(async db => (await db.query('SELECT workspace_id FROM members WHERE user_id=$1 AND archived_at IS NULL ORDER BY workspace_id LIMIT 1', [user])).rows[0], user);
  if (first) return requestAccountDeletion(user, first.workspace_id, body);
  return withSystem(async db => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', ['sec07:'+user]);
    const person = (await db.query('SELECT id,is_demo FROM users WHERE id=$1 FOR UPDATE', [user])).rows[0];
    if (!person || person.is_demo) throw missing();
    if ((await db.query('SELECT 1 FROM members WHERE user_id=$1 AND archived_at IS NULL', [user])).rowCount) throw new ApiError(409,'membership_changed','Your company access changed. Refresh and try again.');
    await anonymiseAccount(db, user);
    await db.query(`INSERT INTO idempotency_keys(user_id,scope,key,fingerprint,result) VALUES($1,'sec07:delete:account','request','sec07','{"status":"completed","practice":false}') ON CONFLICT DO NOTHING`, [user]);
    return { completed:true, practice:false };
  }, user);
}
