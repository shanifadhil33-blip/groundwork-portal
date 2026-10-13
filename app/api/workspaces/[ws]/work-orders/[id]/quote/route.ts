import { endpoint } from '../../../../../../../lib/api';
import { sendQuote } from '../../../../../../../lib/services/quotes';
export const POST = endpoint(({ user, params, body }) => sendQuote(user, params.ws, params.id, body), { body: true });
