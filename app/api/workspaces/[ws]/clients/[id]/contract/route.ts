import { endpoint } from '../../../../../../../lib/api';
import { finishContract } from '../../../../../../../lib/services/archives';

export const POST = endpoint(({ user, params, body }) => finishContract(user, params.ws, params.id, body), { body: true });
