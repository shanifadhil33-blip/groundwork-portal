import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { feedbackSecret, senderHash, INBOX_ORIGIN } from '../lib/inbox';
import { deviceSummary } from '../lib/ui/device';

beforeEach(() => { process.env.FEEDBACK_SECRET = 'y'.repeat(40); });
afterEach(() => { delete process.env.FEEDBACK_SECRET; });

describe('Groundwork plays no part in signing in to the portfolio inbox', () => {
  it('has no inbox pass, pass route or inbox sign in cookie anywhere', () => {
    expect(existsSync(new URL('../app/api/inbox-pass', import.meta.url))).toBe(false);
    const files = execSync("git ls-files app lib components", { encoding: 'utf8' }).split('\n').filter(f => /\.(ts|tsx)$/.test(f));
    const hits = files.filter(f => /inbox-pass|inboxPass|INBOX_PASS|inbox-flow|isInboxOwner/.test(readFileSync(f, 'utf8')));
    expect(hits).toEqual([]);
  });
  it('still posts feedback to the inbox on its one fixed address, with the shared secret', () => {
    expect(INBOX_ORIGIN).toBe('https://adhilshanif.vercel.app');
    expect(feedbackSecret()).toBe('y'.repeat(40));
  });
});
describe('help and feedback', () => {
  it('hides who sent it behind a stable anonymous id', () => {
    expect(senderHash('user-1')).toBe(senderHash('user-1'));
    expect(senderHash('user-1')).not.toBe(senderHash('user-2'));
    expect(senderHash('user-1')).not.toContain('user-1');
  });
  it('tags the device in a short plain line', () => {
    expect(deviceSummary('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36', 390, 844)).toBe('Android phone · Chrome 141 · 390x844');
    expect(deviceSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1', 390, 844)).toBe('iPhone · Safari 18 · 390x844');
  });
  it('is in Settings for every role and never sends email', () => {
    const settings = readFileSync(new URL('../components/app/settings.tsx', import.meta.url), 'utf8');
    expect(settings).toContain("{value:'help',label:'Help',content:<HelpFeedback/>}");
    const route = readFileSync(new URL('../app/api/feedback/route.ts', import.meta.url), 'utf8');
    expect(route).not.toMatch(/resend|nodemailer|sendMail/i);
    expect(route).toContain("requireUser(req)");
  });
  it('remembers the last page before any early return in the shell', () => {
    const shell = readFileSync(new URL('../components/app/shell.tsx', import.meta.url), 'utf8');
    expect(shell.indexOf('LAST_PAGE_KEY, path')).toBeLessThan(shell.indexOf('if (error) return'));
  });
});
