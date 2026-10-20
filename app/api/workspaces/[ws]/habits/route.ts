import { endpoint } from '../../../../../lib/api';
import { getHabits, rememberArea } from '../../../../../lib/services/habits';

export const GET = endpoint(({ user, params }) => getHabits(user, params.ws));
export const POST = endpoint(({ user, params, body }) => rememberArea(user, params.ws, body), { body: true });
