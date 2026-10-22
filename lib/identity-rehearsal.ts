/** Deliberately too short for either credential redemption schema. Never a capability. */
export const PRACTICE_TOKEN = 'practice';
export const PRACTICE_CODE = 'SAMPLE';
export const PRACTICE_NOTICE = 'Practice preview. No one is added or signed in. Nothing is sent.';
export const PRACTICE_EMAIL_HINT = 'Use a fictional email ending in .example.';
export const practiceInviteScope = (ws: string) => `${ws}/identity-rehearsal/invites`;
export const practiceJoinUrl = '/join?preview=worker';
