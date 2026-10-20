import { z } from 'zod';
import { assistant, UNANSWERED } from './assistant';
import { ApiError } from '../http';
import { withSystem } from '../db';
import { seal } from '../secret-box';
import { requiredEnv } from '../env';
import { phoneKey } from '../phone-key';
import { CHANNEL_REPLIES, replyButtons, reviewReply, routeChannel, type ChannelPerson } from '../whatsapp-channel';
import { intakeWhatsApp } from './whatsapp';
import { allowTeam, inWorkspace, uuid } from './shared';

const inbound = z.object({
  from: z.string().trim().min(5).max(30),
  name: z.string().trim().min(1).max(200),
  text: z.string().trim().max(20000).optional(),
  voice_note: z.string().trim().max(20000).optional(),
  button: z.enum(['yes', 'change']).optional(),
  action_id: uuid.optional(),
}).strict();

function calm(error: unknown) {
  if (error instanceof ApiError && error.message && !/sql|stack|token|secret/i.test(error.message)) return error.message;
  return UNANSWERED;
}

/** WA02: a known number reaches the same agent. An unknown number can only raise a request for review. */
export async function answerChannel(actor: string, ws: string, body: unknown) {
  await inWorkspace(actor, ws, async c => allowTeam(c));
  const message = inbound.parse(body);
  const phone = phoneKey(message.from);
  const secret = requiredEnv('AUTH_SECRET');
  const people = (await withSystem(db => db.query(`SELECT m.user_id,m.role,m.workspace_id,m.client_id FROM members m
    JOIN users u ON u.id=m.user_id WHERE m.workspace_id=$1 AND m.archived_at IS NULL
    AND regexp_replace(regexp_replace(coalesce(u.phone,''),'[^0-9]','','g'),'^00','')=$2`, [ws, phone]), actor)).rows as ChannelPerson[];
  // Until a signed WhatsApp webhook exists, this route only acts as the caller himself. Another person's number is raised for review, never run as him.
  const route = routeChannel(ws, people.filter(person => person.user_id === actor), message);
  await withSystem(db => db.query(`INSERT INTO whatsapp_messages(workspace_id,user_id,phone_sealed,body_sealed,voice_sealed,direction,kind)
    VALUES($1,$2,$3,$4,$5,'in',$6)`, [
    ws, route.kind === 'review' ? null : route.person.user_id, seal(phone || message.from, secret),
    message.text ? seal(message.text, secret) : null, message.voice_note ? seal(message.voice_note, secret) : null,
    message.button ? 'button' : message.voice_note && !message.text ? 'voice' : route.kind === 'review' ? 'review' : 'text',
  ]), actor);
  if (route.kind === 'review') {
    if (route.reason !== 'empty' && route.text) await intakeWhatsApp(actor, ws, { from: message.from, name: message.name, text: route.text, media: [] });
    return { text: reviewReply(route, message.name), buttons: [] as ReturnType<typeof replyButtons> };
  }
  if (route.kind === 'confirm' && route.decision === 'change') {
    await withSystem(db => db.query("UPDATE assistant_actions SET declined_at=now(), outcome='declined', reason=$4 WHERE workspace_id=$1 AND user_id=$2 AND id=$3 AND consumed_at IS NULL AND declined_at IS NULL", [ws, route.person.user_id, route.action_id, 'You said no on the card. Nothing was changed.']), actor);
    return { text: 'No change was made.', buttons: [] as ReturnType<typeof replyButtons> };
  }
  try {
    const result = route.kind === 'confirm'
      ? await assistant(route.person.user_id, ws, { messages: [{ role: 'user', content: 'Yes' }], confirm_action_id: route.action_id })
      : await assistant(route.person.user_id, ws, { messages: [{ role: 'user', content: route.text }] });
    const pending = result && typeof result === 'object' && 'pending_action' in result ? (result as { pending_action?: { id?: string } }).pending_action : undefined;
    const text = result && typeof result === 'object' && typeof (result as { reply?: unknown }).reply === 'string' ? (result as { reply: string }).reply : CHANNEL_REPLIES.review;
    return { text, buttons: pending?.id ? replyButtons(pending.id) : [] };
  } catch (error) {
    return { text: calm(error), buttons: [] as ReturnType<typeof replyButtons> };
  }
}
