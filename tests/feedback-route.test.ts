import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/http';

const mocks = vi.hoisted(() => ({ requireUser: vi.fn(), query: vi.fn(), secret: vi.fn(), sender: vi.fn() }));
vi.mock('../lib/auth', () => ({ requireUser: mocks.requireUser }));
vi.mock('../lib/db', () => ({ ownerPool: { query: mocks.query } }));
vi.mock('../lib/inbox', () => ({ INBOX_ORIGIN: 'https://inbox.invalid', feedbackSecret: mocks.secret, senderHash: mocks.sender }));
import { POST } from '../app/api/feedback/route';

const external = vi.fn();
const screenshot = { type: 'image/png', data: 'cGljdHVyZQ==' };
const submit = (body: unknown) => POST(new Request('http://localhost/api/feedback', { method: 'POST', body: JSON.stringify(body) }));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', external);
  mocks.requireUser.mockResolvedValue('current-person');
  mocks.secret.mockReturnValue('test-only');
  mocks.sender.mockReturnValue('anonymous');
});
afterEach(() => vi.unstubAllGlobals());

it.each(['Imran', 'Faisal', 'another sandbox'])('keeps %s demo feedback local even without an inbox secret', async person => {
  const id = `demo-${person}`;
  mocks.requireUser.mockResolvedValue(id);
  mocks.query.mockResolvedValue({ rows: [{ is_demo: true }] });
  mocks.secret.mockImplementation(() => { throw new Error('Must not read inbox credentials'); });
  const response = await submit({ message: 'Please add a calendar', screenshot });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true, simulated: true });
  expect(mocks.query).toHaveBeenCalledTimes(1);
  expect(mocks.query).toHaveBeenCalledWith('SELECT is_demo FROM users WHERE id=$1', [id]);
  expect(external).not.toHaveBeenCalled();
  expect(mocks.secret).not.toHaveBeenCalled();
  expect(mocks.sender).not.toHaveBeenCalled();
});

it('preserves real delivery, role, screenshot and anonymous sender even with demo flags supplied', async () => {
  mocks.query.mockResolvedValueOnce({ rows: [{ is_demo: false }] }).mockResolvedValueOnce({ rows: [{ role: 'admin', is_owner: true }] });
  external.mockResolvedValue(new Response(null, { status: 201 }));
  const response = await submit({ message: '  Please add a calendar  ', screenshot, page: '/settings', device: 'Phone', simulated: true, is_demo: true });
  expect(response.status).toBe(201);
  expect(await response.json()).toEqual({ ok: true });
  expect(external).toHaveBeenCalledTimes(1);
  const [url, init] = external.mock.calls[0];
  expect(url).toBe('https://inbox.invalid/api/inbox');
  expect(JSON.parse(init.body)).toMatchObject({ app: 'Groundwork', message: 'Please add a calendar', screenshot, page: '/settings', device: 'Phone', sender: 'anonymous', role: 'Owner' });
});

it.each([[429, 429], [500, 502]])('preserves real inbox failure %s', async (status, expected) => {
  mocks.query.mockResolvedValueOnce({ rows: [{ is_demo: false }] }).mockResolvedValueOnce({ rows: [] });
  external.mockResolvedValue(new Response(null, { status }));
  expect((await submit({ message: 'Please help' })).status).toBe(expected);
});

describe.each([true, false])('validation with demo=%s', demo => {
  beforeEach(() => mocks.query.mockResolvedValue({ rows: [{ is_demo: demo }] }));
  it.each([
    { message: '  ' }, { message: 'x'.repeat(4001) }, { message: 'Please help', website: 'spam' },
    { message: 'Please help', screenshot: { type: 'text/html', data: 'bad' } },
    { message: 'Please help', screenshot: { type: 'image/png', data: 'x'.repeat(2_000_005) } },
    { message: 'Please help', page: 'x'.repeat(301) }, { message: 'Please help', device: 'x'.repeat(301) },
  ])('rejects invalid input before any delivery', async body => {
    expect((await submit(body)).status).toBe(422);
    expect(external).not.toHaveBeenCalled();
    expect(mocks.query).not.toHaveBeenCalled();
  });
});
it('requires authentication before accepting feedback', async () => {
  mocks.requireUser.mockRejectedValue(new ApiError(401, 'unauthenticated', 'Sign in to continue.'));
  expect((await submit({ message: 'Please help' })).status).toBe(401);
  expect(external).not.toHaveBeenCalled();
  expect(mocks.query).not.toHaveBeenCalled();
});
it('fails closed when the authenticated user no longer exists', async () => {
  mocks.query.mockResolvedValue({ rows: [] });
  expect((await submit({ message: 'Please help' })).status).toBe(401);
  expect(external).not.toHaveBeenCalled();
});
