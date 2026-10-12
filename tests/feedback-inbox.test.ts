import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { inboxPass, isInboxOwner, senderHash, INBOX_ORIGIN } from '../lib/inbox';
import { deviceSummary } from '../lib/ui/device';

const SECRET = 'x'.repeat(40);
beforeEach(() => { process.env.INBOX_PASS_SECRET = SECRET; process.env.FEEDBACK_SECRET = 'y'.repeat(40); });
afterEach(() => { delete process.env.INBOX_PASS_SECRET; delete process.env.FEEDBACK_SECRET; });

describe('portfolio inbox pass', () => {
  it('only lets Adhil’s two real Google accounts in, never a demo account', () => {
    expect(isInboxOwner('shanifadhil33@gmail.com', false)).toBe(true);
    expect(isInboxOwner('ShanifAdhil022@gmail.com', false)).toBe(false); expect(isInboxOwner('ShanifAdhil33@gmail.com', false)).toBe(true);
    expect(isInboxOwner('shanifadhil33@gmail.com', true)).toBe(false);
    expect(isInboxOwner('someone@gmail.com', false)).toBe(false);
    expect(isInboxOwner(null, false)).toBe(false);
  });
  it('signs a short pass the portfolio can check, and it expires in 2 minutes', () => {
    const [body, sig] = inboxPass('shanifadhil33@gmail.com').split('.');
    expect(sig).toBe(createHmac('sha256', SECRET).update(body).digest('base64url'));
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    expect(data).toMatchObject({ email: 'shanifadhil33@gmail.com', purpose: 'pass' });
    expect(data.exp - Date.now() / 1000).toBeLessThanOrEqual(120);
  });
  it('sends people back to one fixed address only', () => {
    expect(INBOX_ORIGIN).toBe('https://adhilshanif.vercel.app');
    const route = readFileSync(new URL('../app/api/inbox-pass/route.ts', import.meta.url), 'utf8');
    // Only two on or off flags are read from the URL, and no query value ever reaches a redirect.
    expect([...route.matchAll(/q\.get\('(\w+)'\)/g)].map(m => m[1]).sort()).toEqual(['back', 'switch']);
    expect(route).not.toMatch(/(Location|redirect)[^\n]*\bq\./i);
    expect(route).toMatch(/prompt: 'select_account'/);
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
