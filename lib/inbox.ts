import { createHmac } from 'node:crypto';
/** Central feedback inbox on the portfolio site (adhilshanif.vercel.app). Groundwork only posts feedback there with a shared secret;
 *  it plays no part in signing in to the inbox (the portfolio has its own Google sign in). No email is ever sent. */
export const INBOX_ORIGIN = 'https://adhilshanif.vercel.app';
function secret() { const v = process.env.FEEDBACK_SECRET; if (!v || v.length < 32) throw new Error('FEEDBACK_SECRET is not set'); return v; }
/** A stable, anonymous sender id so the inbox can rate limit without storing who sent it. */
export const senderHash = (userId: string) => createHmac('sha256', secret()).update('sender:' + userId).digest('hex').slice(0, 40);
export const feedbackSecret = () => secret();
