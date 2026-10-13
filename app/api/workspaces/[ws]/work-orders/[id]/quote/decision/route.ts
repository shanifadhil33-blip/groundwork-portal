import { endpoint } from '../../../../../../../../lib/api';
import { decideQuote } from '../../../../../../../../lib/services/quotes';
export const POST = endpoint(({ user, params, body }) => decideQuote(user, params.ws, params.id, body), { body: true });
