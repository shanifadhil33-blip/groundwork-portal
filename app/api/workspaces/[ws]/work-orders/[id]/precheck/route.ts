import { endpoint } from '../../../../../../../lib/api';
import { getPrecheck, savePrecheck } from '../../../../../../../lib/services/prechecks';
export const GET = endpoint(({ user, params }) => getPrecheck(user, params.ws, params.id));
export const POST = endpoint(({ user, params, body }) => savePrecheck(user, params.ws, params.id, body), { body: true });
