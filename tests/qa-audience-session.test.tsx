import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
const session = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock('../lib/auth', () => ({ getSessionUserId: session.user }));
import { GET } from '../app/api/session/route';
import { StatStrip } from '../components/app/dashboard';
import { StatusBadge } from '../components/ui/states';
import { clientStatusLabels, statusLabels } from '../lib/ui/work-orders';
import { notificationMessage } from '../lib/ui/notifications';
import { audienceStatusReply, plainAssistantReply } from '../lib/ui/assistant-replies';

it('returns a private 200 session probe for anonymous, expired and signed in visits', async () => {
 for (const user of [null, null, 'user']) {
  session.user.mockResolvedValueOnce(user);
  const req = new Request('https://example.com/api/session');
  const response = await GET(req);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ signedIn: Boolean(user) });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(session.user).toHaveBeenLastCalledWith(req);
 }
 for (const file of ['static-session-header', 'not-found-body']) {
  const source = readFileSync(new URL(`../components/public/${file}.tsx`, import.meta.url), 'utf8');
  expect(source).toContain('/api/session');
  expect(source).not.toContain('/api/me');
  expect(source).toContain('signedIn');
 }
 const me = readFileSync(new URL('../app/api/me/route.ts', import.meta.url), 'utf8');
 expect(me).toContain('endpoint(');
});

it('uses the audience status vocabulary across summary, badges, notifications and assistant replies', () => {
 for (const client of [false, true]) {
  const labels = client ? clientStatusLabels : statusLabels;
  const summary = renderToStaticMarkup(<StatStrip counts={{}} client={client}/>);
  for (const [status, title] of Object.entries(labels)) {
   const badge = renderToStaticMarkup(<StatusBadge status={status}>{client ? title : undefined}</StatusBadge>);
   const escaped = renderToStaticMarkup(<span>{title}</span>).slice(6, -7);
   expect(summary).toContain(escaped);
   expect(badge).toContain(escaped);
   expect(notificationMessage({kind:'status_changed', from_status:status, to_status:status}, client)).toContain(`from ${title} to ${title}.`);
   expect(plainAssistantReply(`Status: ${status}`, client)).toBe(`Status: ${title}`);
   expect(audienceStatusReply(`Status: ${statusLabels[status]}`, client)).toBe(`Status: ${title}`);
   expect(plainAssistantReply(`Status: ${title}`, client)).toBe(`Status: ${title}`);
  }
 }
});
