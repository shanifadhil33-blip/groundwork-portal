import { jobRef } from '../lib/agent/job-line';
import React from 'react';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { jobBlock, stack } from '../lib/agent/operational-answers';
import { lineDirection } from '../lib/ui/text-direction';
import { localizedJobTitle } from '../lib/agent/demo-titles';
import { AssistantMarkdown } from '../components/ui/assistant-markdown';
import { DirectedLines } from '../components/ui/directed-lines';
import { DEMO_JOB_TITLES } from '../lib/demo-job-copy';
import { LANGUAGES } from '../lib/languages';
import { choiceWords } from '../lib/agent/choices';

vi.mock('../lib/services/shared', () => ({ inWorkspace: vi.fn() }));
vi.mock('../lib/agent/operational-phrases', () => ({ nativeOperationalIntent: () => null }));
vi.mock('../lib/services/assistant-reads', () => ({}));
vi.mock('../lib/services/work-orders', () => ({}));
vi.mock('../lib/services/attention', () => ({}));

const t = (k: string) => k;
const job = (n: number, title: string, assignee: string | null = null) => jobBlock({ number: n, title, site: 'Marina Exchange', assignee, priority: 'Urgent', due: '18 Oct 2026' }, t);
const unique = (text: string) => { const lines = text.split('\n'); expect(new Set(lines).size, text).toBe(lines.length); expect(lines, text).not.toContain(''); };

describe('quick list answers', () => {
  it('puts each job on one short line, number and title first', () => {
    expect(job(31, 'Adjust meeting room cooling')).toBe('Job #31: Adjust meeting room cooling, Marina Exchange, Urgent, Unassigned, Due: 18 Oct 2026');
    expect(job(51, 'Repair entry door closer', 'Imran')).toBe('Job #51: Repair entry door closer, Marina Exchange, Urgent, Assigned to: Imran, Due: 18 Oct 2026');
  });
  it('keeps the opening lines first and never repeats a line, even when jobs share every detail', () => {
    const text = stack(['Late jobs: 3.', 'Chase first: Job #31.'], [job(31, 'Same title'), job(56, 'Same title'), job(57, 'Same title')]);
    expect(text.split('\n')).toHaveLength(5);
    expect(text.split('\n').slice(0, 2)).toEqual(['Late jobs: 3.', 'Chase first: Job #31.']);
    unique(text);
    expect(text).not.toMatch(/[-\u2010-\u2015]/);
  });
  it('keeps a job on one line when a title or site name holds a line break', () => {
    expect(jobBlock({ number: 7, title: 'Fix\n\nleak', site: 'Tower\nA', assignee: null, priority: 'Low', due: '1 Nov 2026' }, t)).toBe('Job #7: Fix leak, Tower A, Low, Unassigned, Due: 1 Nov 2026');
  });
  it.each(LANGUAGES.map(l => l.code))('%s: shared details never repeat a line, with no dashes in the words around the data', code => {
    const w = choiceWords(code);
    const jobs = [31, 56, 51].map(n => jobBlock({ number: n, title: localizedJobTitle('Adjust meeting room cooling', code, true), site: 'Marina Exchange', assignee: n === 51 ? 'Imran' : null, priority: w('Urgent'), due: '19 Oct 2026' }, w, code));
    const text = stack([`${w('Late jobs')}: 3.`], jobs);
    unique(text);
    expect(text.split('\n')).toHaveLength(4);
    for (const [i,line] of jobs.entries()) expect(line.startsWith(jobRef([31,56,51][i],code)+': ')).toBe(true);
    expect(text.replace(/Marina Exchange|\d{1,2} Oct 2026/g, '')).not.toMatch(/[-\u2010-\u2015]/);
    if (code === 'ar-AE') expect(jobs[0]).toBe('مهمة #31: اضبط تبريد غرفة الاجتماعات، Marina Exchange، عاجل، غير معين، الموعد النهائي: 19 Oct 2026');
  });
});

describe('reply layout on screen', () => {
  const reply = stack(['Late jobs: 2.'], [job(31, 'Adjust meeting room cooling'), job(56, 'Service water pump')]);
  it('the main Ask panel shows each line as its own block', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={reply} />);
    expect((html.match(/class="bidi-line"/g) ?? []).length).toBe(3);
    expect(html).toContain('Job #56: Service water pump, Marina Exchange');
    expect(html).not.toContain('\n');
  });
  it('lists keep the earlier markup apart from direction', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={'- One\n- Two'} />);
    expect(html).toContain('<ul><li dir="ltr">One</li><li dir="ltr">Two</li></ul>');
  });
  it('an Arabic job line reads right to left', () => {
    const line = jobBlock({ number: 31, title: 'اضبط تبريد غرفة الاجتماعات', site: 'Marina Exchange', assignee: null, priority: 'عاجل', due: '19 Oct 2026' }, choiceWords('ar-AE'), 'ar-AE');
    expect(lineDirection(line)).toBe('rtl');
    expect(renderToStaticMarkup(<DirectedLines text={line} />)).toContain('dir="rtl"');
  });
});

describe('reading direction per line', () => {
  it('keeps a Latin only line left to right so the full stop stays at the end', () => {
    expect(lineDirection('Job #31: Adjust meeting room cooling.')).toBe('ltr');
    const html = renderToStaticMarkup(<DirectedLines text={'Job #31: Adjust meeting room cooling.'} />);
    expect(html).toContain('dir="ltr"');
  });
  it.each([
    ['ar-AE', 'Job #31: اضبط تبريد غرفة الاجتماعات.'],
    ['ur', 'Job #31: میٹنگ روم کی ٹھنڈک ٹھیک کریں۔'],
    ['ps', 'Job #31: د غونډې خونې یخوالی برابر کړئ.'],
    ['fa-AF', 'Job #31: سردی اتاق جلسه را تنظیم کنید.'],
    ['fa-IR', 'Job #31: سرمایش اتاق جلسه را تنظیم کنید.'],
  ])('reads a mixed %s line right to left', (_code, text) => {
    expect(lineDirection(text)).toBe('rtl');
    expect(renderToStaticMarkup(<DirectedLines text={text} />)).toContain('dir="rtl"');
  });
  it('gives each line its own direction in one reply', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={'Job #31: اضبط تبريد غرفة الاجتماعات\nSite: Marina Exchange'} />);
    expect(html).toMatch(/dir="rtl"[^>]*>مهمة #31: اضبط/);
    expect(html).toMatch(/dir="ltr"[^>]*>Site: Marina Exchange/);
  });
});

describe('sample job titles in quick answers', () => {
  it('uses the shipped Arabic title in the demo workspace, the same words as the dashboard', () => {
    expect(localizedJobTitle('Adjust meeting room cooling', 'ar-AE', true)).toBe('اضبط تبريد غرفة الاجتماعات');
  });
  it('covers every sample title that has a shipped translation, in each language', () => {
    for (const { code } of LANGUAGES.filter(l => !l.code.startsWith('en'))) for (const title of DEMO_JOB_TITLES) expect(localizedJobTitle(title, code, true)).toBe(choiceWords(code)(title));
  });
  it('never changes real workspaces, English, or titles that are not sample titles', () => {
    expect(localizedJobTitle('Adjust meeting room cooling', 'ar-AE', false)).toBe('Adjust meeting room cooling');
    expect(localizedJobTitle('Adjust meeting room cooling', 'en-IN', true)).toBe('Adjust meeting room cooling');
    expect(localizedJobTitle('Fix the gate at Kevin Villa', 'ar-AE', true)).toBe('Fix the gate at Kevin Villa');
  });
});

describe('job lines stand apart in chat bubbles', () => {
  const css = readFileSync(new URL('../app/screens.css', import.meta.url), 'utf8').replace(/\s*([{};:,])\s*/g, '$1').replace(/;\}/g, '}');
  const marked = (html: string) => [...html.matchAll(/<span ([^>]*)>([^<]*)<\/span>/g)].filter(m => m[1].includes('data-wo')).map(m => m[2]);
  it('marks each line that starts with a WO number, with or without a bullet, and no other line', () => {
    const text = ['Late jobs: 3.', 'Job #31: Adjust meeting room cooling, Marina Exchange, Urgent', '• Job #56: Service water pump', '- Job #57: Fix leak', 'Today: 0.', 'Chase first: Job #31.', 'WORK 12', 'Unread updates: 2.'].join('\n');
    const html = renderToStaticMarkup(<DirectedLines text={text} />);
    expect(marked(html)).toEqual(['Job #31: Adjust meeting room cooling, Marina Exchange, Urgent', '• Job #56: Service water pump', '- Job #57: Fix leak']);
    expect((html.match(/class="bidi-line"/g) ?? []).length).toBe(8);
    expect(text.split('\n')).not.toContain('');
  });
  it('marks job lines in the Agent panel too, left to right and right to left', () => {
    const ar = jobBlock({ number: 31, title: 'اضبط تبريد غرفة الاجتماعات', site: 'Marina Exchange', assignee: null, priority: 'عاجل', due: '19 Oct 2026' }, choiceWords('ar-AE'), 'ar-AE');
    const html = renderToStaticMarkup(<AssistantMarkdown text={stack(['Late jobs: 2.'], [job(56, 'Service water pump'), ar])} />);
    expect(marked(html)).toHaveLength(2);
    expect(html).toMatch(/dir="ltr" class="bidi-line" data-wo="">Job #56/);
    expect(html).toMatch(/dir="rtl" class="bidi-line" data-wo="">مهمة #31: اضبط/);
    expect(html).toMatch(/dir="ltr" class="bidi-line">Late jobs/);
  });
  it('gives a marked line a small logical gap above it, never above the first line', () => {
    expect(css).toMatch(/\.bidi-line\[data-wo\]:not\(:first-child\)\{margin-block-start:6px\}/);
  });
});
