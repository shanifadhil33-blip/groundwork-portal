// JOB22. This module imports the live sandbox only inside a deliberately enabled run.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const fixtureUrl = new URL('../tests/fixtures/real-world-situations.json', import.meta.url);
const languages = new Set(['en', 'ar-AE', 'ml', 'fil']);

export function options(env = process.env) {
  const raw = env.MAX_CALLS ?? '0';
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) throw new Error('MAX_CALLS must be a whole number at least zero.');
  const language = env.LANGUAGE ?? 'en';
  if (!languages.has(language)) throw new Error('Choose one of the four fixture languages.');
  if (env.DRY_RUN !== undefined && !['0', '1'].includes(env.DRY_RUN)) throw new Error('DRY_RUN must be 0 or 1.');
  return {
    maxCalls: Number(raw), dryRun: env.DRY_RUN === '1', language,
    ids: env.CASE_IDS?.split(',').map(value => value.trim()).filter(Boolean) ?? [],
    reportPath: resolve(env.REPORT_PATH ?? 'e2e/reports/real-world-run.json'),
  };
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}

function compare(before, after) {
  const changed = [], unknown = [];
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const a = before[key], b = after[key];
    if (!a?.ok || !b?.ok) { unknown.push(key); continue; }
    if (a.complete === false || b.complete === false) unknown.push(key);
    if (JSON.stringify(canonical(a.body)) !== JSON.stringify(canonical(b.body))) changed.push(key);
  }
  return { anything_changed: changed.length ? true : unknown.length ? null : false, changed_resources: changed, incomplete_resources: unknown };
}

async function checked(response) {
  const text = await response.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { text }; }
  return { ok: response.ok(), status: response.status(), body };
}

async function read(api, path) {
  try { return await checked(await api.get(path, { timeout: 30000 })); }
  catch (error) { return { ok: false, status: null, body: { error: String(error) } }; }
}

function rows(value) { return Array.isArray(value) ? value : value?.data ?? []; }

async function switchTo(session, persona) {
  const result = await checked(await session.as(persona));
  if (!result.ok) throw new Error(`Could not sign in as ${persona}. Status ${result.status}.`);
}

// Admin reads detect changes beyond the requesting actor scope. The actor reads include his own memory and messages.
// A failed or truncated read remains unknown and cannot be reported as unchanged.
export async function snapshot(session, persona) {
  const base = `/api/workspaces/${session.ws}`;
  const state = {};
  async function capture(key, path) {
    const result = await read(session.api, path);
    const data = rows(result.body);
    // Several read APIs have fixed limits. Keep comparable evidence but mark it incomplete.
    if (Array.isArray(data) && ((typeof result.body?.total === 'number' && result.body.total > data.length) ||
      ((/messages|team-space|notifications/.test(path)) && data.length >= 100))) result.complete = false;
    state[key] = result;
    return result;
  }
  async function conversations(prefix) {
    const result = await capture(`${prefix} conversations`, `${base}/messages`);
    for (const thread of rows(result.body)) if (thread.id) {
      const field = thread.kind === 'job' ? 'work_order_id' : 'conversation_id';
      await capture(`${prefix} conversation ${thread.id}`, `${base}/messages?${field}=${encodeURIComponent(thread.id)}`);
    }
  }
  await switchTo(session, persona);
  await capture('Actor memory', `${base}/assistant/learning`);
  await capture('Actor preferences', '/api/me/preferences');
  await capture('Actor identity', '/api/me');
  await capture('Actor notifications', `${base}/notifications?pageSize=100`);
  await conversations('Actor');
  await switchTo(session, 'imran');
  try {
    for (const [key, path] of Object.entries({
      Sites: '/request-sites', Clients: '/clients', Team: '/team', Leave: '/time-off',
      Documents: '/documents', Suggestions: '/suggestions', Questions: '/agent-questions',
      Approvals: '/agent-approvals', Decisions: '/assistant/log', Memory: '/assistant/learning',
      Settings: '/settings', Overview: '/overview', TeamMessages: '/team-space',
    })) await capture(key, base + path);
    let page = 1, count = 0;
    while (true) {
      const result = await capture(`Jobs page ${page}`, `${base}/work-orders?pageSize=100&page=${page}&sort=created_at&dir=asc`);
      if (!result.ok) break;
      const jobs = rows(result.body);
      for (const job of jobs) {
        await capture(`Job ${job.id}`, `${base}/work-orders/${job.id}`);
        await capture(`Job photos ${job.id}`, `${base}/work-orders/${job.id}/photos`);
        await capture(`Job messages ${job.id}`, `${base}/messages?work_order_id=${job.id}`);
      }
      count += jobs.length;
      // Individual pages are partial, but the loop observes the full job collection.
      delete result.complete;
      if (count >= result.body.total) break;
      if (!jobs.length || page >= 100 || typeof result.body.total !== 'number') {
        state['Jobs pagination'] = { ok: false, status: null, body: { error: 'Job list could not be fully read.' } };
        break;
      }
      page += 1;
    }
    await conversations('Admin');
  } finally { await switchTo(session, persona); }
  return state;
}

export function groupBySection(cases) {
  const sections = {};
  for (const result of cases) {
    const section = sections[result.section] ??= { total: 0, attempted: 0, needs_review: 0, errors: 0, skipped: 0, cases: [] };
    section.total += 1;
    section.attempted += result.attempted ? 1 : 0;
    section.needs_review += result.status === 'needs_review' ? 1 : 0;
    section.errors += result.status === 'error' ? 1 : 0;
    section.skipped += ['needs_setup', 'needs_data', 'to_translate', 'cap_reached'].includes(result.status) ? 1 : 0;
    section.cases.push(result.id);
  }
  return sections;
}

export async function run({ env = process.env, connect, cases: suppliedCases, observe = snapshot, save } = {}) {
  const config = options(env);
  // Injected transports remain available for offline tests during the freeze.
  if (!connect && !config.dryRun && env.RUN_ASSISTANT_QA !== '1') return { calls: 0, status: 'disabled', cases: [], sections: {} };
  // No fixture read, report write, Playwright import, sign in or request at the default cap.
  if (!config.dryRun && config.maxCalls === 0) return { calls: 0, status: 'disabled', cases: [], sections: {} };
  const fixtures = suppliedCases ?? JSON.parse(await readFile(fixtureUrl, 'utf8'));
  const unknown = config.ids.filter(id => !fixtures.some(test => test.id === id));
  if (unknown.length) throw new Error(`Unknown case ids: ${unknown.join(', ')}.`);
  if (new Set(config.ids).size !== config.ids.length) throw new Error('CASE_IDS must contain each id once.');
  if (!config.dryRun && !config.ids.length) throw new Error('Select prepared cases with CASE_IDS before a live run.');
  const selected = fixtures.filter(test => !config.ids.length || config.ids.includes(test.id));
  const report = {
    started_at: new Date().toISOString(), language: config.language, dry_run: config.dryRun,
    max_calls: config.maxCalls, calls: 0, cases: [], sections: {},
    measurement: 'Initial turns only. Cards require separate human review. No confirmations are sent.',
    observation_scope: 'Visible API records only. Unavailable reads make change detection incomplete.',
  };
  const persist = async () => {
    report.sections = groupBySection(report.cases);
    if (save) await save(report);
    else { await mkdir(dirname(config.reportPath), { recursive: true }); await writeFile(config.reportPath, JSON.stringify(report, null, 2) + '\n'); }
  };
  let session;
  try {
    for (const test of selected) {
      const result = { id: test.id, section: test.section, persona: test.persona, expected: test.expected, edge_cases: test.edge_cases, attempted: false };
      report.cases.push(result);
      const content = test.says[config.language];
      if (config.dryRun) {
        Object.assign(result, { status: 'dry_run', says: content, input_kind: test.input_kind, needs_data: test.needs_data });
      } else if (!content) Object.assign(result, { status: 'to_translate', reason: 'No approved text exists in the chosen language.' });
      else if (test.needs_data) Object.assign(result, { status: 'needs_data', reason: 'Resolve the catalogue placeholder before running.' });
      else if (test.input_kind !== 'text') Object.assign(result, { status: 'needs_setup', reason: `This case requires ${test.input_kind} input and a separate prepared flow.` });
      else if (report.calls >= config.maxCalls) result.status = 'cap_reached';
      else {
        let previousLanguage, preferenceSet = false;
        try {
          // Keep this dynamic import behind every local guard.
          if (!session) session = await (connect ?? (async persona => (await import('./sandbox.mjs')).sandbox(persona)))(test.persona);
          await switchTo(session, test.persona);
          const preferences = await checked(await session.api.get('/api/me/preferences'));
          if (!preferences.ok) throw new Error('Could not read the current language.');
          previousLanguage = preferences.body.language ?? null;
          const preference = await checked(await session.api.patch('/api/me/preferences', { data: { language: config.language === 'en' ? 'en-GB' : config.language } }));
          if (!preference.ok) throw new Error('Could not select the run language.');
          preferenceSet = true;
          result.before = await observe(session, test.persona);
          // Persist consumed budget before sending. Failed requests consume budget and are never retried.
          report.calls += 1;
          Object.assign(result, { attempted: true, status: 'sending', says: content });
          await persist();
          try {
            const response = await checked(await session.api.post(`/api/workspaces/${session.ws}/assistant`, {
              data: { messages: [{ role: 'user', content }] }, timeout: 300000,
            }));
            Object.assign(result, {
              status: response.ok ? 'needs_review' : 'error', response_status: response.status,
              reply: response.body.reply ?? response.body.message ?? null, response: response.body,
              cards: { pending_action: response.body.pending_action ?? null, cards: response.body.cards ?? [], actions: response.body.actions ?? [], offers: response.body.offers ?? [], choice: response.body.choice ?? null },
            });
          } catch (error) { Object.assign(result, { status: 'error', error: String(error) }); }
          // Also observe after a failed or timed out request: a server write might already have happened.
          result.after = await observe(session, test.persona);
          Object.assign(result, compare(result.before, result.after));
        } catch (error) { Object.assign(result, { status: 'error', error: String(error), anything_changed: null }); }
        finally {
          if (session && preferenceSet) {
            try {
              await switchTo(session, test.persona);
              const restored = await checked(await session.api.patch('/api/me/preferences', { data: { language: previousLanguage } }));
              if (!restored.ok) throw new Error('Could not restore the original language.');
            } catch (error) { result.cleanup_error = String(error); }
          }
        }
      }
      await persist();
    }
  } finally {
    report.finished_at = new Date().toISOString();
    try { await persist(); }
    finally { await session?.api.dispose(); }
  }
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await run();
    console.log(report.status === 'disabled' ? 'Live assistant QA is disabled. Set RUN_ASSISTANT_QA=1 and a positive MAX_CALLS after the freeze.' : `Recorded ${report.calls} Agent requests. Review the report by section.`);
  } catch (error) { console.error(String(error)); process.exitCode = 1; }
}
