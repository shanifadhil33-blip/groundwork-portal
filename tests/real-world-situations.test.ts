import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import fixture from './fixtures/real-world-situations.json';
import { allowedTool } from '../lib/agent/role-tools';
import { ids } from '../lib/fixture';
import { closePools, withSystem } from '../lib/db';
import { startDemo } from '../lib/services/demo';
import { listMembers } from '../lib/services/members';

afterAll(closePools);

const roles = {
  imran: 'admin', sam: 'staff', ravi: 'technician', nabil: 'office',
  pranav: 'client:manager', kevin: 'client:office', faisal: 'client:household',
} as const;
const role = z.enum(['admin', 'staff', 'technician', 'office', 'client:manager', 'client:office', 'client:household']);
const words = z.string().trim().min(1);
const schema = z.object({
  id: z.string().regex(/^RW\d{2}$/), number: z.number().int().min(1).max(80), section: words, title: words,
  persona: z.enum(['imran', 'sam', 'ravi', 'nabil', 'pranav', 'kevin', 'faisal']), persona_role: role,
  source_actor: words, notes: z.array(words), says_en: words,
  says: z.object({ en: words, 'ar-AE': z.null(), ml: z.null(), fil: z.null() }).strict(),
  translation_status: z.object({ en: z.literal('ready'), 'ar-AE': z.literal('to translate'), ml: z.literal('to translate'), fil: z.literal('to translate') }).strict(),
  needs_data: z.boolean(), input_kind: z.enum(['text', 'event', 'composite', 'voice', 'unknown_sender', 'photo', 'language_setup']),
  expected: z.object({
    changes: z.array(words).min(1), confirm_by: words, refuse_for: z.array(role), refusal_scope: words,
    must_not: z.array(words).min(1), one_question_max: z.literal(true), reply: words, action_receipt: words,
  }).strict(),
  edge_cases: z.array(words).min(1), top_demo: z.boolean(),
  tools_hint: z.array(z.union([words, z.object({ missing: words }).strict()])).min(1),
}).strict();
const cases = z.array(schema).parse(fixture);
// This inventory is fixed to the external catalogue numbers, not derived from the fixture.
const sections = [
  ['Payment and contracts', 1, 14], ['Job outcomes', 15, 27], ['People', 28, 39],
  ['Clients', 40, 51], ['Data errors', 52, 60], ['Emergencies', 61, 67],
  ['Language and channel', 68, 70], ['Memory', 71, 74], ['How the agent behaves', 75, 80],
] as const;
const topDemo = [1, 3, 4, 8, 15, 16, 17, 19, 22, 28, 32, 35, 52, 55, 61, 71, 73, 75, 80];
const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');
// Read the actual exported object without importing services, accessing a database or calling a model.
const { parse } = createRequire(import.meta.url)('next/dist/compiled/babel/parser');
const ast = parse(read('../lib/agent/tools.ts'), { sourceType: 'module', plugins: ['typescript'] });
const toolDeclaration = ast.program.body.flatMap((node: any) => node.declaration?.declarations ?? [])
  .find((node: any) => node.id.name === 'tools');
const toolNames = new Set<string>(toolDeclaration.init.properties.map((property: any) => property.key.name ?? property.key.value));

it('includes all 80 catalogue entries exactly once in their original sections', () => {
  expect(cases.map(test => test.number).sort((a, b) => a - b)).toEqual(Array.from({ length: 80 }, (_, index) => index + 1));
  expect(new Set(cases.map(test => test.id)).size).toBe(80);
  for (const test of cases) expect(test.id).toBe(`RW${String(test.number).padStart(2, '0')}`);
  for (const [section, first, last] of sections) {
    expect(cases.filter(test => test.section === section).map(test => test.number)).toEqual(Array.from({ length: last - first + 1 }, (_, index) => first + index));
  }
});

it('maps every actor to the real sandbox membership and records role differences', async () => {
  const sandbox = await startDemo({persona:'imran'},'local-real-world-situations');
  const imran = await withSystem(async db=>(await db.query("SELECT id FROM users WHERE demo_workspace_id=$1 AND demo_persona='imran'",[sandbox.body.workspace_id])).rows[0].id);
  const members = await listMembers(imran,sandbox.body.workspace_id);
  const demo = read('../lib/services/demo.ts');
  const memberships = { imran: 'admin', sam: 'staff', ravi: 'technician', nabil: 'staff', pranav: 'client', kevin: 'client', faisal: 'client' };
  for (const [persona, membership] of Object.entries(memberships)) {
    expect(ids).toHaveProperty(persona);
    expect(demo).toContain(`'${persona}'`);
    expect(members.find(member=>member.name?.toLowerCase()===persona)?.role).toBe(membership);
  }
  expect(members.find(member=>member.name==='Nabil')?.staff_kind).toBe('office');
  expect(members.find(member=>member.name==='Kevin')?.client_kind).toBe('office');
  expect(members.find(member=>member.name==='Faisal')?.client_kind).toBe('household');
  for (const test of cases) {
    expect(test.persona_role).toBe(roles[test.persona]);
    if (/Building manager|Unknown WhatsApp/.test(test.source_actor)) expect(test.notes.length).toBeGreaterThan(0);
  }
  expect(cases.find(test => test.number === 45)?.persona).toBe('kevin');
  expect(cases.find(test => test.number === 41)?.persona).toBe('pranav');
});

it('uses real tools allowed for each persona or explicitly names the missing capability', () => {
  expect(toolNames.size).toBeGreaterThan(40);
  for (const test of cases) {
    expect(new Set(test.expected.refuse_for).size).toBe(test.expected.refuse_for.length);
    const seen = new Set<string>();
    for (const hint of test.tools_hint) {
      const key = typeof hint === 'string' ? hint : hint.missing;
      expect(seen.has(key), `${test.id}: duplicate hint ${key}`).toBe(false);
      seen.add(key);
      if (typeof hint !== 'string') { expect(hint.missing.trim().length).toBeGreaterThan(5); continue; }
      expect(toolNames.has(hint), `${test.id}: unknown tool ${hint}`).toBe(true);
      if (!test.expected.refuse_for.includes(test.persona_role)) expect(allowedTool(test.persona_role, hint), `${test.id}: ${hint} is not allowed for ${test.persona}`).toBe(true);
    }
  }
});

it('keeps copy clear of dashes and leaves all translations explicitly pending', () => {
  for (const test of cases) {
    expect(test.says_en).not.toMatch(/[-\u2013\u2014]/u);
    expect(test.says.en).toBe(test.says_en);
    expect(test.expected.must_not).toContain('invent a fault, part, amount or payment');
    if (test.expected.confirm_by !== 'none') expect(test.expected.must_not).toContain('act before a yes');
    expect(test.needs_data).toBe(/\[(amount|number)\]/.test(test.says_en));
    for (const language of ['ar-AE', 'ml', 'fil'] as const) {
      expect(test.says[language]).toBeNull();
      expect(test.translation_status[language]).toBe('to translate');
    }
    // Check all human prose fields, excluding machine language keys, paths and role identifiers.
    for (const text of [test.title, test.section, ...test.expected.changes, ...test.expected.must_not, ...test.edge_cases]) expect(text).not.toMatch(/[-\u2013\u2014]/u);
  }
  expect(cases.filter(test => test.needs_data).map(test => test.number)).toEqual([11]);
});

it('flags exactly the section 11 demo references including rebooking entry 17', () => {
  expect(cases.filter(test => test.top_demo).map(test => test.number)).toEqual(topDemo);
});

it('keeps coverage counts and the missing capability inventory in sync', () => {
  const coverage = read('./fixtures/real-world-situations-coverage.md');
  for (const [section, first, last] of sections) {
    const group = cases.filter(test => test.section === section);
    const complete = group.filter(test => test.tools_hint.every(hint => typeof hint === 'string')).length;
    expect(coverage).toContain(`| ${section} | ${last - first + 1} | ${complete} | ${group.length - complete} |`);
  }
  const missing = new Map<string, string[]>();
  for (const test of cases) for (const hint of test.tools_hint) if (typeof hint !== 'string') missing.set(hint.missing, [...missing.get(hint.missing) ?? [], test.id]);
  for (const [capability, ids] of missing) expect(coverage).toContain(`${capability}: ${ids.join(', ')}.`);
});

// Inject a fake transport. These checks cannot import or call the live sandbox.
const runnerPath = '../e2e/real-world-run.mjs';
const runner = await import(runnerPath);
const response = (body: unknown, status = 200) => ({ text: async () => JSON.stringify(body), ok: () => status < 400, status: () => status });
function transport(failFirst = false) {
  let language: string | null = 'ml', writes = 0, active = 0, maxActive = 0;
  const snapshots: string[] = [];
  const api = {
    get: vi.fn(async () => response({ language })),
    patch: vi.fn(async (_path: string, options: any) => { language = options.data.language; return response({ language }); }),
    post: vi.fn(async () => {
      active += 1; maxActive = Math.max(active, maxActive); writes += 1;
      await Promise.resolve(); active -= 1;
      if (failFirst && writes === 1) throw new Error('Simulated timeout after a write.');
      return response({ reply: 'Please review this.', pending_action: { id: 'review', summary: 'Save the requested change' } });
    }),
    dispose: vi.fn(async () => {}),
  };
  const session = { api, ws: 'fixture', as: vi.fn(async () => response({})) };
  return { api, connect: vi.fn(async () => session), observe: vi.fn(async (_session: unknown, persona: string) => { snapshots.push(persona); return { Jobs: { ok: true, body: { writes } } }; }), snapshots, maxActive: () => maxActive, language: () => language };
}

describe('later runner local guards and observations', () => {
  it('does nothing at the default cap and rejects invalid settings', async () => {
    const connect = vi.fn(), save = vi.fn();
    expect(await runner.run({ env: {}, connect, save })).toMatchObject({ calls: 0, status: 'disabled' });
    expect(connect).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
    for (const MAX_CALLS of ['bad', '1.5', '-1', 'Infinity']) expect(() => runner.options({ MAX_CALLS })).toThrow();
    expect(() => runner.options({ DRY_RUN: 'yes' })).toThrow();
    expect(() => runner.options({ LANGUAGE: 'unknown' })).toThrow();
  });

  it('plans all cases with no sign in and no model request in dry run', async () => {
    const connect = vi.fn(), save = vi.fn();
    const result = await runner.run({ env: { DRY_RUN: '1' }, cases, connect, save });
    expect(result.calls).toBe(0); expect(result.cases).toHaveLength(80); expect(Object.keys(result.sections)).toHaveLength(9);
    expect(result.cases.every((test: any) => test.status === 'dry_run')).toBe(true);
    expect(connect).not.toHaveBeenCalled(); expect(save).toHaveBeenCalled();
  });

  it('requires explicit case selection before any connection', async () => {
    const connect = vi.fn();
    await expect(runner.run({ env: { MAX_CALLS: '1' }, cases, connect })).rejects.toThrow('Select prepared cases');
    await expect(runner.run({ env: { MAX_CALLS: '1', CASE_IDS: 'RW99' }, cases, connect })).rejects.toThrow('Unknown case ids');
    expect(connect).not.toHaveBeenCalled();
  });

  it('skips absent translations, unresolved data and unsupported inputs without connecting', async () => {
    const connect = vi.fn(), save = vi.fn();
    const translated = await runner.run({ env: { MAX_CALLS: '5', CASE_IDS: 'RW23', LANGUAGE: 'ml' }, cases, connect, save });
    expect(translated.cases[0].status).toBe('to_translate');
    const result = await runner.run({ env: { MAX_CALLS: '5', CASE_IDS: 'RW11,RW51,RW68,RW73,RW76,RW80' }, cases, connect, save });
    expect(result.calls).toBe(0); expect(result.cases[0].status).toBe('needs_data');
    expect(result.cases.slice(1).every((test: any) => test.status === 'needs_setup')).toBe(true);
    expect(connect).not.toHaveBeenCalled();
  });

  it('caps requests, runs serially, records cards and changes, and restores language', async () => {
    const fake = transport(), save = vi.fn();
    const result = await runner.run({ env: { MAX_CALLS: '2', CASE_IDS: 'RW23,RW32,RW36' }, cases, ...fake, save });
    expect(result.calls).toBe(2); expect(fake.api.post).toHaveBeenCalledTimes(2); expect(fake.maxActive()).toBe(1);
    expect(result.cases.map((test: any) => test.status)).toEqual(['needs_review', 'needs_review', 'cap_reached']);
    expect(result.cases[0]).toMatchObject({ reply: 'Please review this.', anything_changed: true, cards: { pending_action: { id: 'review' } } });
    expect(fake.api.post.mock.calls.every((args: any) => !args[1]?.data.confirm_action_id)).toBe(true);
    expect(fake.language()).toBe('ml'); expect(fake.api.dispose).toHaveBeenCalledTimes(1);
    expect(result.sections.People.attempted).toBe(1);
  });

  it('counts failed requests and observes after a timeout without retrying', async () => {
    const fake = transport(true);
    const result = await runner.run({ env: { MAX_CALLS: '1', CASE_IDS: 'RW23,RW32' }, cases, ...fake, save: vi.fn() });
    expect(result.calls).toBe(1); expect(fake.api.post).toHaveBeenCalledTimes(1);
    expect(result.cases[0]).toMatchObject({ status: 'error', anything_changed: true });
    expect(fake.observe).toHaveBeenCalledTimes(2); expect(result.cases[1].status).toBe('cap_reached');
  });

  it('reports unavailable observations as unknown rather than unchanged', async () => {
    const fake = transport();
    const observe = vi.fn(async () => ({ Jobs: { ok: false, status: 403 } }));
    const result = await runner.run({ env: { MAX_CALLS: '1', CASE_IDS: 'RW23' }, cases, ...fake, observe, save: vi.fn() });
    expect(result.cases[0]).toMatchObject({ anything_changed: null, incomplete_resources: ['Jobs'] });
  });

  it('reads all job pages and uses the correct message scope in real snapshots', async () => {
    const as = vi.fn(async () => response({}));
    const get = vi.fn(async (path: string) => {
      if (path.includes('/work-orders?')) return response({ total: 2, data: [{ id: path.includes('page=2') ? 'second' : 'first' }] });
      if (path.endsWith('/messages')) return response({ data: [{ id: 'direct', kind: 'direct' }, { id: 'job', kind: 'job' }] });
      if (path.endsWith('/documents')) return response({ error: 'Unavailable' }, 403);
      return response({ data: [] });
    });
    const state = await runner.snapshot({ ws: 'fixture', as, api: { get } }, 'ravi');
    expect(state['Job first'].ok).toBe(true); expect(state['Job second'].ok).toBe(true);
    expect(state.Documents.ok).toBe(false);
    expect(get.mock.calls.some(([path]) => path.endsWith('/messages?work_order_id=job'))).toBe(true);
    expect(get.mock.calls.some(([path]) => path.endsWith('/messages?conversation_id=direct'))).toBe(true);
    expect(get.mock.calls.some(([path]) => path.endsWith('/messages?conversation_id=job'))).toBe(false);
    expect(as.mock.calls).toEqual([['ravi'], ['imran'], ['ravi']]);
  });
});
