import { endpoint } from '../../../../../lib/api';
import { addTimeOff, listTimeOff } from '../../../../../lib/services/time-off';
export const GET = endpoint(({ user, params }) => listTimeOff(user, params.ws), {});
export const POST = endpoint(({ user, params, body, key }) => addTimeOff(user, params.ws, body, key), { body: true, status: 201 });
