import { phoneKey } from './phone-key';

/** WA02: a known number reaches the same agent with that person's permissions. An unknown number can only raise a request for review. */
export type ChannelPerson = { user_id: string; role: string; workspace_id: string; client_id: string | null };

export type ChannelInbound = {
  from: string;
  name: string;
  text?: string;
  voice_note?: string;
  button?: 'yes' | 'change';
  action_id?: string;
};

export type ChannelRoute =
  | { kind: 'review'; reason: 'unknown' | 'ambiguous' | 'empty'; phone: string; text: string; voice: string | null }
  | { kind: 'agent'; person: ChannelPerson; text: string; voice: boolean }
  | { kind: 'confirm'; person: ChannelPerson; action_id: string; decision: 'yes' | 'change' };

export const CHANNEL_REPLIES = {
  review: 'Thanks. The team will review this request.',
  ambiguous: 'This number matches more than one person. The team will review this request.',
  empty: 'Send a few words and the team will review them.',
  yes: 'Yes',
  change: 'Change',
} as const;

export function replyButtons(actionId: string) {
  return [
    { id: 'yes' as const, title: CHANNEL_REPLIES.yes, action_id: actionId },
    { id: 'change' as const, title: CHANNEL_REPLIES.change, action_id: actionId },
  ];
}

export function routeChannel(workspaceId: string, people: ChannelPerson[], inbound: ChannelInbound): ChannelRoute {
  const phone = phoneKey(inbound.from);
  const text = (inbound.text ?? '').trim();
  const voice = (inbound.voice_note ?? '').trim();
  const here = people.filter(person => person.workspace_id === workspaceId && person.user_id);
  const matches = phone.length >= 8 ? here : [];
  // The caller passes only people already matched to this phone inside this company.
  const unique = [...new Map(matches.map(person => [person.user_id, person])).values()];
  if (unique.length > 1) return { kind: 'review', reason: 'ambiguous', phone, text: text || voice, voice: voice || null };
  if (unique.length === 0) return { kind: 'review', reason: text || voice ? 'unknown' : 'empty', phone, text: text || voice, voice: voice || null };
  const person = unique[0];
  if (inbound.button && inbound.action_id) return { kind: 'confirm', person, action_id: inbound.action_id, decision: inbound.button };
  const spoken = text || voice;
  if (!spoken) return { kind: 'review', reason: 'empty', phone, text: '', voice: voice || null };
  return { kind: 'agent', person, text: spoken, voice: !text && !!voice };
}

/** Unknown numbers never receive a confirmation, even if they send a button. */
export function reviewReply(route: Extract<ChannelRoute, { kind: 'review' }>, name: string) {
  const line = route.reason === 'ambiguous' ? CHANNEL_REPLIES.ambiguous : route.reason === 'empty' ? CHANNEL_REPLIES.empty : CHANNEL_REPLIES.review;
  const first = name.trim().split(/\s+/)[0];
  return first ? `${first}, ${line.charAt(0).toLowerCase()}${line.slice(1)}` : line;
}
