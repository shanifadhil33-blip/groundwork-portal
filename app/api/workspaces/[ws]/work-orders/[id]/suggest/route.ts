import { endpoint } from '../../../../../../../lib/api';
import { suggestWorkers } from '../../../../../../../lib/services/assign';
export const GET = endpoint(({ user, params }) => suggestWorkers(user, params.ws, params.id), {});
