import { endpoint } from '../../../../../../../lib/api';
import { sendQuote } from '../../../../../../../lib/services/quotes';
export const POST = endpoint(({ user, params, body, key }) => sendQuote(user, params.ws, params.id, body, key), { body: true });
