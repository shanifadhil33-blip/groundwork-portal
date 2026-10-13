import { z } from 'zod';
import { withSystem } from '../db';
import { ApiError, invalid } from '../http';
import { allow, inWorkspace, uuid } from './shared';
import { sendPush } from './push';

/** Company documents with expiry dates. Admins and supervisors only. Stored in Postgres like photos, so each file is small. */
export const DOC_TYPES = ['trade_licence', 'insurance', 'permit', 'certificate', 'contract', 'other'] as const;
export const DOC_MAX_BYTES = 1024 * 1024, DOCS_PER_COMPANY = 40;
const SOON_DAYS = 30;
const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'] as const;
const date = z.iso.date().nullable().optional();
const fields = { doc_type: z.enum(DOC_TYPES), title: z.string().trim().min(1).max(120), issued_on: date, expires_on: date, responsible_id: uuid.nullable().optional() };
const uploadSchema = z.object({ ...fields, file_name: z.string().trim().min(1).max(200), mime: z.enum(MIMES), data: z.string().min(100).max(Math.ceil(DOC_MAX_BYTES * 4 / 3) + 8) }).strict();
const patchSchema = z.object({ doc_type: fields.doc_type.optional(), title: fields.title.optional(), issued_on: date, expires_on: date, responsible_id: fields.responsible_id }).strict();
const COLS = `d.id, d.doc_type, d.title, d.issued_on::text, d.expires_on::text, d.responsible_id, d.file_name, d.mime, octet_length(d.bytes)::int AS size, d.created_at, d.updated_at,
  (SELECT u.name FROM visible_user(d.responsible_id) u) AS responsible_name,
  CASE WHEN d.expires_on IS NULL THEN NULL ELSE d.expires_on - (CURRENT_TIMESTAMP AT TIME ZONE w.timezone)::date END AS days_left`;

function looksLike(mime: string, b: Buffer) {
  if (mime === 'application/pdf') return b.subarray(0, 5).toString('latin1') === '%PDF-';
  if (mime === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (mime === 'image/png') return b.subarray(1, 4).toString('latin1') === 'PNG';
  return b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP';
}
function checkDates(issued?: string | null, expires?: string | null) { if (issued && expires && expires < issued) throw invalid('The expiry date is before the issue date.', 'expires_on'); }
async function checkResponsible(c: { db: { query: (q: string, v: unknown[]) => Promise<{ rowCount: number | null }> } }, ws: string, id?: string | null) {
  if (!id) return;
  const r = await c.db.query("SELECT 1 FROM members WHERE workspace_id=$1 AND user_id=$2 AND role IN ('admin','staff','technician')", [ws, id]);
  if (!r.rowCount) throw invalid('Choose someone from your team.', 'responsible_id');
}

export async function listDocuments(user: string, ws: string, params?: URLSearchParams) {
  const soon = params?.get('expiring') === 'true';
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    return (await c.db.query(`SELECT ${COLS} FROM company_documents d JOIN workspaces w ON w.id=d.workspace_id WHERE d.workspace_id=$1
      ${soon ? `AND d.expires_on IS NOT NULL AND d.expires_on <= (CURRENT_TIMESTAMP AT TIME ZONE w.timezone)::date + ${SOON_DAYS}` : ''}
      ORDER BY d.expires_on NULLS LAST, d.title`, [ws])).rows;
  });
}

export async function addDocument(user: string, ws: string, body: unknown) {
  const d = uploadSchema.parse(body); checkDates(d.issued_on, d.expires_on);
  const bytes = Buffer.from(d.data, 'base64');
  if (bytes.length < 100 || bytes.length > DOC_MAX_BYTES) throw invalid('This file is too big. The limit is 1 MB.', 'data');
  if (!looksLike(d.mime, bytes)) throw invalid('This file is not a PDF or a photo.', 'data');
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    await checkResponsible(c, ws, d.responsible_id);
    const n = (await c.db.query('SELECT count(*)::int n FROM company_documents WHERE workspace_id=$1', [ws])).rows[0].n;
    if (n >= DOCS_PER_COMPANY) throw invalid(`You can keep ${DOCS_PER_COMPANY} documents. Remove an old one first.`, 'data');
    const id = (await c.db.query(`INSERT INTO company_documents(workspace_id,doc_type,title,issued_on,expires_on,responsible_id,file_name,mime,bytes,added_by)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,app_user_id()) RETURNING id`, [ws, d.doc_type, d.title, d.issued_on ?? null, d.expires_on ?? null, d.responsible_id ?? null, d.file_name, d.mime, bytes])).rows[0].id;
    return (await c.db.query(`SELECT ${COLS} FROM company_documents d JOIN workspaces w ON w.id=d.workspace_id WHERE d.id=$1`, [id])).rows[0];
  });
}

export async function patchDocument(user: string, ws: string, id: string, body: unknown) {
  uuid.parse(id); const d = patchSchema.parse(body);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const cur = (await c.db.query('SELECT issued_on::text, expires_on::text FROM company_documents WHERE workspace_id=$1 AND id=$2 FOR UPDATE', [ws, id])).rows[0];
    if (!cur) throw new ApiError(404, 'not_found', 'Document not found.');
    checkDates(d.issued_on !== undefined ? d.issued_on : cur.issued_on, d.expires_on !== undefined ? d.expires_on : cur.expires_on);
    await checkResponsible(c, ws, d.responsible_id);
    const keys = Object.keys(d) as (keyof typeof d)[];
    if (keys.length) await c.db.query(`UPDATE company_documents SET ${keys.map((k, i) => `${k}=$${i + 3}`).join(',')}, updated_at=now() WHERE workspace_id=$1 AND id=$2`, [ws, id, ...keys.map(k => d[k] ?? null)]);
    return (await c.db.query(`SELECT ${COLS} FROM company_documents d JOIN workspaces w ON w.id=d.workspace_id WHERE d.id=$1`, [id])).rows[0];
  });
}

export async function getDocumentFile(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const f = (await c.db.query('SELECT mime, bytes, file_name FROM company_documents WHERE workspace_id=$1 AND id=$2', [ws, id])).rows[0];
    if (!f) throw new ApiError(404, 'not_found', 'Document not found.');
    return f as { mime: string; bytes: Buffer; file_name: string };
  });
}

export async function removeDocument(user: string, ws: string, id: string) {
  uuid.parse(id);
  return inWorkspace(user, ws, async c => {
    allow(c, ['admin', 'staff']);
    const r = await c.db.query('DELETE FROM company_documents WHERE workspace_id=$1 AND id=$2 RETURNING id', [ws, id]);
    if (!r.rowCount) throw new ApiError(404, 'not_found', 'Document not found.');
    return { removed: id };
  });
}

/** Daily: a push 30 days before, 7 days before and on the day a document expires, to the person responsible and the admins and supervisors. */
export async function pushExpiringDocuments() {
  const due = (await withSystem(db => db.query(`SELECT d.id, d.workspace_id, d.title, d.responsible_id, d.expires_on - (CURRENT_TIMESTAMP AT TIME ZONE w.timezone)::date AS left
    FROM company_documents d JOIN workspaces w ON w.id=d.workspace_id
    WHERE w.demo_expires_at IS NULL AND d.expires_on - (CURRENT_TIMESTAMP AT TIME ZONE w.timezone)::date IN (30, 7, 0)`))).rows;
  let sent = 0;
  for (const d of due) {
    const office = (await withSystem(db => db.query("SELECT user_id FROM members WHERE workspace_id=$1 AND archived_at IS NULL AND role IN ('admin','staff')", [d.workspace_id]))).rows.map(r => r.user_id as string);
    const when = d.left === 0 ? 'expires today' : `expires in ${d.left} days`;
    sent += await sendPush([d.responsible_id, ...office], { title: 'Document expiring', body: `${d.title} ${when}.`, url: '/documents', tag: `doc-${d.id}-${d.left}` });
  }
  return { documents: due.length, sent };
}
