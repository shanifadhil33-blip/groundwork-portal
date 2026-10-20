import { createHmac, timingSafeEqual } from 'node:crypto';
import { phoneKey } from './phone-key';

/** SIGN10: the agent never saves a phone number until the code for that number matches. */
export const PHONE_REPLIES_AR = { hidden: 'ما أقدر أغيّر رقم تلفونك من هني. اطلب من المكتب يغيّره لك.' } as const;

export const PHONE_REPLIES = {
  hidden: 'I cannot change your phone number here. Ask the office to change it for you.',
  askNumber: 'What is the new phone number?',
  confirmSend: 'Send a code to this number?',
  askCode: 'Type the code from your new number. The number is not saved until the code matches.',
  mismatch: 'That code did not match. The number was not saved.',
  expired: 'That code expired. Ask again for a new one.',
  locked: 'Too many tries. Ask again for a new code.',
  saved: 'Your phone number is saved.',
  same: 'That is already your number. Nothing was changed.',
  noSender: 'Sending codes to phones is not switched on yet, so no code went out. Your number stays as it is. Ask the office to change it for you.',
} as const;

export type PhoneAsk =
  | { kind: 'ask_number' }
  | { kind: 'number'; phone: string }
  | { kind: 'code'; code: string }
  | { kind: 'none' };

const CODE = /^(?:code\s*)?(\d{6})$/;

export function readPhoneAsk(text: string): PhoneAsk {
  const words = text.normalize('NFC').trim().replace(/[.!?؟]+$/u, '').replace(/\s+/gu, ' ');
  const lower = words.toLowerCase();
  if (/^(?:please\s+)?(?:change|update) my phone(?: number)?$/.test(lower) || lower === 'غير رقم هاتفي' || lower === 'غير رقمي') return { kind: 'ask_number' };
  const code = CODE.exec(words.replace(/\s/g, ''));
  if (code) return { kind: 'code', code: code[1] };
  if (/^(?:my )?(?:new )?phone(?: number)? is\s+/i.test(words) || /^\+\d[\d\s]{6,}$/.test(words) || /^0\d[\d\s]{6,}$/.test(words)) {
    const raw = words.replace(/^(?:my )?(?:new )?phone(?: number)? is\s+/i, '').trim();
    const phone = phoneKey(raw);
    if (phone.length >= 8 && phone.length <= 15) return { kind: 'number', phone };
  }
  return { kind: 'none' };
}

/** True only when a real sender delivers codes. None is connected, so the agent never says a code was sent. */
export function codeSenderReady(env: Record<string, string | undefined> = process.env) { return env.PHONE_CODE_SENDER === 'whatsapp' && !!env.WHATSAPP_SEND_TOKEN; }

export function hashPhoneCode(code: string, secret: string) {
  return createHmac('sha256', secret).update(`phonecode:${code}`).digest('hex');
}

export function phoneCodeMatches(code: string, hash: string, secret: string) {
  const next = Buffer.from(hashPhoneCode(code, secret));
  const prev = Buffer.from(hash);
  return next.length === prev.length && timingSafeEqual(next, prev);
}

/** The message that goes to the new number. It is sealed in the outbox and never copied into the agent reply. */
export function codeMessage(code: string) { return `Your Groundwork code is ${code}.`; }

export function phoneLookup(phone: string, secret: string) {
  return createHmac('sha256', secret).update(`phone:${phoneKey(phone)}`).digest('hex');
}
