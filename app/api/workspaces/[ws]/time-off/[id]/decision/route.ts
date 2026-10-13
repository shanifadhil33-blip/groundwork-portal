import { endpoint } from '../../../../../../../lib/api';
import { decideTimeOff } from '../../../../../../../lib/services/time-off';
export const PUT = endpoint(({ user, params, body }) => decideTimeOff(user, params.ws, params.id, body), { body: true });
