import { plainAssistantReply } from './assistant-replies';

/** Everything the demo chat says in its own voice. English is the key; the language files carry the rest. */
export const DEMO_CHAT_COPY = {
  name: 'Groundwork Assistant',
  label: 'Demo chat. This is a simulation using sample data. It is not connected to WhatsApp.',
  online: 'Online',
  typing: 'Typing',
  placeholder: 'Type a message',
  send: 'Send message',
  starters: 'Try one of these',
  confirmQuestion: 'Shall I go ahead?',
  yes: 'Yes, go ahead',
  no: 'Not now',
  declined: 'No problem. Nothing was changed.',
  errorTitle: 'That message did not go through.',
  retry: 'Try again',
  demoOnly: 'This chat is only available in the demo.',
  demoOnlyLink: 'Try the demo',
  delivered: 'Delivered',
  read: 'Read',
  navLabel: 'Demo chat',
  openLabel: 'Open the demo chat',
  windowLabel: 'Chat with Groundwork Assistant',
} as const;

export const DEMO_CHAT_STARTERS = [
  'Which jobs are overdue today?',
  'Who is free tomorrow morning?',
  'Book a visit for Al Barsha villa',
] as const;

/** Every English sentence the screen can show, in one list for the language files and the tests. */
export const DEMO_CHAT_WORDS: string[] = [...Object.values(DEMO_CHAT_COPY), ...DEMO_CHAT_STARTERS];

const CANDIDATE = /\+?\(?\d[\d\s()\-–.]{6,}\d/g;
const DATE_LIKE = /^\d{1,4}[.\-–]\d{1,2}[.\-–]\d{1,4}$/;
/** The demo never shows a phone number, whoever typed it or whatever the reply contained. */
export function hidePhoneNumbers(text: string): string {
  return text.replace(CANDIDATE, found => {
    const digits = found.replace(/\D/g, '').length;
    if (digits < 8 || DATE_LIKE.test(found.trim())) return found;
    return '(number hidden)';
  });
}

/** A reply as it appears in a chat bubble: plain words, no dashes, no phone numbers. */
export function chatText(text: string, client = false): string {
  return plainAssistantReply(hidePhoneNumbers(text), client).replace(/[–—]/g, ',').trim();
}

export function chatTime(date: Date, language: string): string {
  try { return new Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' }).format(date); }
  catch { return new Intl.DateTimeFormat('en', { hour: '2-digit', minute: '2-digit' }).format(date); }
}
