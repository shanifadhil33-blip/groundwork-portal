/** Deliberately too short for either credential redemption schema. Never a capability. */
export const PRACTICE_TOKEN = 'practice';
export const PRACTICE_CODE = 'SAMPLE';
export const PRACTICE_NOTICE = 'This is a demo. No one is invited and nothing is sent.';
export const PRACTICE_EMAIL_HINT = 'Use a fictional email ending in .example.';
export const practiceInviteScope = (ws: string) => `${ws}/identity-rehearsal/invites`;
export const practiceJoinUrl = '/join?preview=worker';
