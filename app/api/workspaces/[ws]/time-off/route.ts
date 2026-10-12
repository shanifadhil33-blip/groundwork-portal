import { endpoint } from '../../../../../lib/api';
import { addTimeOff, listTimeOff } from '../../../../../lib/services/time-off';
export const GET = endpoint(({ user, params }) => listTimeOff(user, params.ws), {});
export const POST = endpoint(({ user, params, body }) => addTimeOff(user, params.ws, body), { body: true, status: 201 });
