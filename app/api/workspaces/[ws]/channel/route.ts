import { endpoint } from '../../../../../lib/api';
import { answerChannel } from '../../../../../lib/services/channel';
export const POST = endpoint(({ user, params, body }) => answerChannel(user, params.ws, body), { body: true });
