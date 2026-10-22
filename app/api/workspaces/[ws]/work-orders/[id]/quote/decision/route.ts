import { endpoint } from '../../../../../../../../lib/api';
import { decideQuote } from '../../../../../../../../lib/services/quotes';
export const POST = endpoint(({ user, params, body, key }) => decideQuote(user, params.ws, params.id, body, key), { body: true });
