import { endpoint } from '../../../../../../../lib/api';
import { setWorkerSkills } from '../../../../../../../lib/services/assign';
export const PUT = endpoint(({ user, params, body }) => setWorkerSkills(user, params.ws, params.userId, body), { body: true });
