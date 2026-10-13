import type { Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import fs from 'node:fs';
// Writes /workspace/qa/e2e/latest.md: pass rate plus every connection with its result.
export default class MdReporter implements Reporter {
  rows: { title: string; status: string; error?: string }[] = [];
  onTestEnd(t: TestCase, r: TestResult) {
    const prev = this.rows.findIndex(x => x.title === t.titlePath().slice(2).join(' › '));
    const row = { title: t.titlePath().slice(2).join(' › '), status: r.status, error: r.error?.message?.split('\n')[0]?.slice(0, 200) };
    if (prev >= 0) this.rows[prev] = row; else this.rows.push(row);
  }
  onEnd() {
    const dir = process.env.E2E_REPORT_DIR ?? '/workspace/qa/e2e';
    fs.mkdirSync(dir, { recursive: true });
    const run = this.rows.filter(r => r.status !== 'skipped'), pass = run.filter(r => r.status === 'passed').length;
    const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }) + ' GST';
    const md = [`# Groundwork live e2e`, ``, `Run: ${when}. Site: ${process.env.E2E_BASE_URL ?? 'https://groundwork-portal.vercel.app'}`, ``, `**Pass rate: ${pass}/${run.length} (${run.length ? Math.round(pass / run.length * 100) : 0}%)**, skipped (not built yet): ${this.rows.length - run.length}`, ``, `| Check | Result | Note |`, `|---|---|---|`,
      ...this.rows.map(r => `| ${r.title} | ${r.status === 'passed' ? 'pass' : r.status === 'skipped' ? 'skipped' : 'FAIL'} | ${(r.error ?? '').replace(/\|/g, '/').replace(/\x1b\[[0-9;]*m/g, '')} |`)].join('\n');
    fs.writeFileSync(`${dir}/latest.md`, md + '\n');
  }
}
