import React from 'react';
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
const job = (n: number, title: string) => jobBlock({ number: n, title, site: 'Marina Exchange', assignee: 'Unassigned', priority: 'Urgent', due: '18 Oct 2026' }, t);

describe('quick list answers', () => {
  it('puts the job number and every fact on its own line', () => {
    expect(job(31, 'Adjust meeting room cooling').split('\n')).toEqual(['WO 31: Adjust meeting room cooling', 'Site: Marina Exchange', 'Assigned to: Unassigned', 'Priority: Urgent', 'Due date: 18 Oct 2026']);
  });
  it('leaves a blank line between jobs and keeps the opening lines together', () => {
    const text = stack(['Late jobs: 2.', 'Chase first: WO 31.'], [job(31, 'A'), job(56, 'B')]);
    const blocks = text.split('\n\n');
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe('Late jobs: 2.\nChase first: WO 31.');
    expect(blocks[1]).toMatch(/^WO 31/);
    expect(blocks[2]).toMatch(/^WO 56/);
    expect(text).not.toMatch(/\. WO \d/);
  });
});

describe('reply layout on screen', () => {
  const reply = stack(['Late jobs: 2.'], [job(31, 'Adjust meeting room cooling'), job(56, 'Service water pump')]);
  it('the main Ask panel shows each line as its own block', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={reply} />);
    expect((html.match(/class="bidi-line"/g) ?? []).length).toBe(1 + 5 + 5);
    expect(html).toContain('WO 56: Service water pump');
    expect(html).not.toContain('\n');
  });
  it('lists keep the earlier markup apart from direction', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={'- One\n- Two'} />);
    expect(html).toContain('<ul><li dir="ltr">One</li><li dir="ltr">Two</li></ul>');
  });
});

describe('reading direction per line', () => {
  it('keeps a Latin only line left to right so the full stop stays at the end', () => {
    expect(lineDirection('WO 31: Adjust meeting room cooling.')).toBe('ltr');
    const html = renderToStaticMarkup(<DirectedLines text={'WO 31: Adjust meeting room cooling.'} />);
    expect(html).toContain('dir="ltr"');
  });
  it.each([
    ['ar-AE', 'WO 31: اضبط تبريد غرفة الاجتماعات.'],
    ['ur', 'WO 31: میٹنگ روم کی ٹھنڈک ٹھیک کریں۔'],
    ['ps', 'WO 31: د غونډې خونې یخوالی برابر کړئ.'],
    ['fa-AF', 'WO 31: سردی اتاق جلسه را تنظیم کنید.'],
    ['fa-IR', 'WO 31: سرمایش اتاق جلسه را تنظیم کنید.'],
  ])('reads a mixed %s line right to left', (_code, text) => {
    expect(lineDirection(text)).toBe('rtl');
    expect(renderToStaticMarkup(<DirectedLines text={text} />)).toContain('dir="rtl"');
  });
  it('gives each line its own direction in one reply', () => {
    const html = renderToStaticMarkup(<AssistantMarkdown text={'WO 31: اضبط تبريد غرفة الاجتماعات\nSite: Marina Exchange'} />);
    expect(html).toMatch(/dir="rtl"[^>]*>WO 31: اضبط/);
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
