import { choiceWords, isLanguageFileWord } from './choices';

export const UNANSWERED = 'I could not do that right now, so nothing was changed. Try again in a minute, or use the buttons on the page.';
export const UNAVAILABLE = 'I can’t answer that right now. Please try again in a minute. Everything else in Groundwork works as usual.';
export const INCOMPLETE = 'I could not finish answering. Please check the page before trying again.';
export const ACTION_LIMIT = 'I have done as much as I can in one reply. Please ask for one thing at a time.';

// Fixed application refusals are safe English copy even before translations ship.
// Keep this an exact allowlist: exception or provider text is never trusted.
const SAFE_REFUSALS = new Set([
 'You can raise and follow your own requests here. Ask your service company for anything else.',
 'You can save notes only on jobs you can see. Nothing was saved.',
 'You can save a note only on a request you raised. Nothing was saved.',
 'This visit time is no longer free. Choose another time.',
]);

/** Errors use shipped words, even when the AI and translation service are unavailable.
 * Unknown server messages must never reach the chat (they may contain private details).
 */
export function failureWords(language?: string | null, source = UNAVAILABLE) {
 const word = choiceWords(language);
 if (isLanguageFileWord(language, source)) return source;
 const translated = word(source);
 return translated !== source || (/^en(?:-|$)/i.test(language || 'en') && (SAFE_REFUSALS.has(source) || choiceWords('ar-AE')(source) !== source)) ? translated : word(UNAVAILABLE);
}
