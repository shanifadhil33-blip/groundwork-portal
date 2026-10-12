import { createHmac } from 'node:crypto';
/** Central feedback inbox on the portfolio site (adhilshanif.vercel.app). No email is ever sent. */
export const INBOX_ORIGIN = 'https://adhilshanif.vercel.app';
const INBOX_OWNERS = ['shanifadhil33@gmail.com'];
function secret(name: 'INBOX_PASS_SECRET' | 'FEEDBACK_SECRET') { const v = process.env[name]; if (!v || v.length < 32) throw new Error(name + ' is not set'); return v; }
/** A 2 minute signed pass for the portfolio inbox; same format the portfolio verifies. */
export function inboxPass(email: string) {
  const body = Buffer.from(JSON.stringify({ email, purpose: 'pass', exp: Math.floor(Date.now() / 1000) + 120 })).toString('base64url');
  return `${body}.${createHmac('sha256', secret('INBOX_PASS_SECRET')).update(body).digest('base64url')}`;
}
export const isInboxOwner = (email: string | null | undefined, isDemo: boolean) => !isDemo && !!email && INBOX_OWNERS.includes(email.toLowerCase());
/** A stable, anonymous sender id so the inbox can rate limit without storing who sent it. */
export const senderHash = (userId: string) => createHmac('sha256', secret('FEEDBACK_SECRET')).update('sender:' + userId).digest('hex').slice(0, 40);
export const feedbackSecret = () => secret('FEEDBACK_SECRET');
