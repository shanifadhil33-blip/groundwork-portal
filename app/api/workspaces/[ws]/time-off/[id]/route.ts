import { endpoint } from '../../../../../../lib/api';
import { removeTimeOff } from '../../../../../../lib/services/time-off';
export const DELETE = endpoint(({ user, params }) => removeTimeOff(user, params.ws, params.id), {});
