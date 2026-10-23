import { afterAll, beforeEach, expect, it, vi } from 'vitest';
vi.mock('../lib/ai', async original => ({ ...await original<typeof import('../lib/ai')>(), assistantTurn: vi.fn() }));
vi.mock('web-push', () => ({ default: { setVapidDetails: () => {}, sendNotification: async () => ({}) } }));
import { assistantTurn } from '../lib/ai';
import { assistant } from '../lib/services/assistant';
import { closePools, ownerPool, withSystem } from '../lib/db';
import { ids } from '../lib/fixture';
import { seed } from '../scripts/seed';
import { saveCompanyRule, savePersonalLearning } from '../lib/services/agent-learning';
import { listCompanyMemory, companyMemoryContext, correctCompanyMemory, deleteCompanyMemory } from '../lib/services/company-memory';
import { decideLesson, listLessons } from '../lib/services/lessons';
import { setAuthResolverForTests } from '../lib/auth';
import { callTool } from '../lib/agent/tools';
import { GET } from '../app/api/workspaces/[ws]/company-memory/route';
import { PATCH, DELETE } from '../app/api/workspaces/[ws]/company-memory/[id]/route';

const ws = ids.ridgeline;
const words = 'Always group plumbing visits by area for the company';
beforeEach(async () => {
  vi.mocked(assistantTurn).mockReset();
  const db = await ownerPool.connect();
  try { await seed(db); await db.query('DELETE FROM company_rules WHERE workspace_id=$1', [ws]); }
  finally { db.release(); }
  setAuthResolverForTests();
});
afterAll(async () => { setAuthResolverForTests(); await closePools(); });
const rule = () => saveCompanyRule(ids.imran, ws, { body: words });
const routeContext = (id?: string, workspace = ws) => ({ params: Promise.resolve({ ws: workspace, ...(id ? { id } : {}) }) });

it('shows a recorded lesson with real source evidence and a count, never personal notes', async () => {
  const saved = await rule();
  await savePersonalLearning(ids.sam, ws, { body: 'Private supervisor preference' });
  const memory = await listCompanyMemory(ids.imran, ws);
  expect(memory.can_edit).toBe(true);
  expect(memory.data).toHaveLength(1);
  expect(memory.data[0]).toMatchObject({ id: saved.id, body: words, recorded_by: 'Imran', context_uses: 0 });
  expect(memory.data[0].created_at).toBeTruthy();
  expect(JSON.stringify(memory)).not.toContain('Private supervisor preference');
  expect(await companyMemoryContext(ids.sam, ws)).toContain(words);
  expect((await listCompanyMemory(ids.sam, ws)).data[0].context_uses).toBe(1);
});

it('enforces owner/admin writes and supervisor read only through the HTTP endpoints', async () => {
  const saved = await rule();
  for (const user of [ids.imran, ids.sam]) {
    setAuthResolverForTests(async () => user);
    const response = await GET(new Request('http://local/api'), routeContext());
    expect(response.status).toBe(200);
    expect((await response.json()).can_edit).toBe(user === ids.imran);
  }
  for (const user of [ids.sam, ids.nabil, ids.ravi, ids.pranav]) {
    setAuthResolverForTests(async () => user);
    expect((await PATCH(new Request('http://local/api', { method: 'PATCH', body: JSON.stringify({ body: 'Corrected company instruction' }) }), routeContext(saved.id))).status).toBe(403);
    expect((await DELETE(new Request('http://local/api', { method: 'DELETE' }), routeContext(saved.id))).status).toBe(403);
    if (user !== ids.sam) expect((await GET(new Request('http://local/api'), routeContext())).status).toBe(403);
  }
  setAuthResolverForTests(async () => null);
  expect((await GET(new Request('http://local/api'), routeContext())).status).toBe(401);
  expect((await listCompanyMemory(ids.imran, ws)).data).toHaveLength(1);
});

it('a plain admin can correct, but every company correction waits for explicit approval', async () => {
  await withSystem(db => db.query('UPDATE members SET is_owner=false WHERE workspace_id=$1 AND user_id=$2', [ws, ids.imran]));
  const saved = await rule();
  const corrected = 'Always check the gas isolation before work';
  expect(await correctCompanyMemory(ids.imran, ws, saved.id, { body: corrected })).toEqual({ status: 'waiting' });
  expect(await companyMemoryContext(ids.imran, ws)).not.toContain(words);
  expect(await companyMemoryContext(ids.imran, ws)).not.toContain(corrected);
  const pending = (await listLessons(ids.imran, ws)).data.find(l => l.body === corrected);
  expect(pending).toMatchObject({ scope: 'company', status: 'waiting' });
  await expect(decideLesson(ids.sam, ws, pending.id, { yes: true })).rejects.toMatchObject({ status: 403 });
  await decideLesson(ids.imran, ws, pending.id, { yes: true });
  expect(await companyMemoryContext(ids.imran, ws)).toContain(corrected);
  expect(await companyMemoryContext(ids.imran, ws)).not.toContain(words);
});

it('validates a correction atomically and refuses missing or foreign company ids', async () => {
  const saved = await rule();
  for (const body of [{ body: '' }, { body: 'x'.repeat(301) }, { body: 'New rule', scope: 'personal' }]) {
    await expect(correctCompanyMemory(ids.imran, ws, saved.id, body)).rejects.toThrow();
  }
  expect(await correctCompanyMemory(ids.imran, ws, saved.id, { body: words })).toEqual({ status: 'unchanged' });
  expect((await listCompanyMemory(ids.imran, ws)).data[0].body).toBe(words);
  const foreign = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
  await expect(deleteCompanyMemory(ids.imran, ws, foreign)).rejects.toMatchObject({ status: 404 });
  await expect(correctCompanyMemory(ids.imran, ws, foreign, { body: 'Different instruction' })).rejects.toMatchObject({ status: 404 });
  await expect(listCompanyMemory(ids.imran, foreign)).rejects.toMatchObject({ status: 404 });
});

it('deleting through HTTP removes the lesson from the actual next Agent plan prompt', async () => {
  const saved = await rule();
  vi.mocked(assistantTurn).mockResolvedValue({ calls: [], text: 'How can I help?' });
  const plan = () => assistant(ids.imran, ws, { messages: [{ role: 'user', content: 'Help me plan plumbing visits by area' }] });
  await plan();
  expect(vi.mocked(assistantTurn).mock.calls.at(-1)![2]).toContain(words);
  expect((await listCompanyMemory(ids.imran, ws)).data[0].context_uses).toBe(1);
  setAuthResolverForTests(async () => ids.imran);
  expect((await DELETE(new Request('http://local/api', { method: 'DELETE' }), routeContext(saved.id))).status).toBe(200);
  vi.mocked(assistantTurn).mockClear();
  await plan();
  expect(vi.mocked(assistantTurn)).toHaveBeenCalled();
  expect(vi.mocked(assistantTurn).mock.calls.at(-1)![2]).not.toContain(words);
  expect((await listCompanyMemory(ids.imran, ws)).data).toEqual([]);
});

it('the existing Agent tool path requires confirmation and refuses supervisor edits', async () => {
  const saved = await rule();
  const c = { user: ids.imran, ws, scope: 'write' as const, kind: 'assistant' as const };
  expect(await callTool(c, 'delete_company_memory', { id: saved.id })).toMatchObject({ isError: true, structuredContent: { error: { code: 'confirmation_required' } } });
  expect(await callTool({ ...c, user: ids.sam, approved: true }, 'correct_company_memory', { id: saved.id, body: 'New company lesson' })).toMatchObject({ isError: true, structuredContent: { error: { code: 'forbidden' } } });
  expect(await callTool({ ...c, approved: true }, 'delete_company_memory', { id: saved.id })).toMatchObject({ structuredContent: { result: { deleted: true } } });
  expect(await companyMemoryContext(ids.imran, ws)).not.toContain(words);
});

it('keeps another company’s lessons and counts separate and rejects archived membership', async () => {
  const saved = await rule();
  const other = await saveCompanyRule(ids.summitAdmin, ids.summit, { body: 'Summit company instruction' });
  await expect(listCompanyMemory(ids.summitAdmin, ws)).rejects.toMatchObject({ status: 404 });
  await expect(companyMemoryContext(ids.summitAdmin, ws)).rejects.toMatchObject({ status: 404 });
  await expect(deleteCompanyMemory(ids.summitAdmin, ids.summit, saved.id)).rejects.toMatchObject({ status: 404 });
  await expect(correctCompanyMemory(ids.imran, ws, other.id, { body: 'Wrong company correction' })).rejects.toMatchObject({ status: 404 });
  await companyMemoryContext(ids.imran, ws);
  const otherMemory = await listCompanyMemory(ids.summitAdmin, ids.summit);
  expect(otherMemory.data.find(l => l.id === other.id)?.context_uses).toBe(0);
  expect(JSON.stringify(otherMemory)).not.toContain(words);
  await withSystem(db => db.query('UPDATE members SET archived_at=now() WHERE workspace_id=$1 AND user_id=$2', [ws, ids.sam]));
  await expect(listCompanyMemory(ids.sam, ws)).rejects.toMatchObject({ status: 404 });
  await expect(companyMemoryContext(ids.sam, ws)).rejects.toMatchObject({ status: 404 });
});

it('an Agent correction card identifies the lesson and confirmation only queues its replacement', async () => {
  const saved = await rule();
  const corrected = 'Group visits by building before choosing a technician';
  vi.mocked(assistantTurn).mockResolvedValueOnce({ calls: [{ id: 'correct', name: 'correct_company_memory', args: { id: saved.id, body: corrected } }] });
  const answer = await assistant(ids.imran, ws, { messages: [{ role: 'user', content: 'Correct the company lesson about visits' }] });
  expect(answer).toHaveProperty('pending_action');
  const pending = (answer as { pending_action: { id: string; summary: string } }).pending_action;
  expect(pending.summary).toContain(words); expect(pending.summary).toContain(corrected);
  expect(await companyMemoryContext(ids.imran, ws)).toContain(words);
  const before = vi.mocked(assistantTurn).mock.calls.length;
  await assistant(ids.imran, ws, { messages: [{ role: 'user', content: 'Yes' }], confirm_action_id: pending.id });
  expect(vi.mocked(assistantTurn).mock.calls).toHaveLength(before);
  expect(await companyMemoryContext(ids.imran, ws)).not.toContain(words);
  expect(await companyMemoryContext(ids.imran, ws)).not.toContain(corrected);
  expect((await listLessons(ids.imran, ws)).data.some(l => l.body === corrected)).toBe(true);
});
