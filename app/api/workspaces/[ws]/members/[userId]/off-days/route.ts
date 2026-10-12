import { endpoint } from '../../../../../../../lib/api';
import { setOffDays } from '../../../../../../../lib/services/time-off';
export const PUT = endpoint(({ user, params, body }) => setOffDays(user, params.ws, params.userId, body), { body: true });
