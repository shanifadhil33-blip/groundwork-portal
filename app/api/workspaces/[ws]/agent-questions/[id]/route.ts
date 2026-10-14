import { endpoint } from '../../../../../../lib/api';
import { decideAgentQuestion } from '../../../../../../lib/services/agent-questions';
export const POST = endpoint(({ user, params, body }) => decideAgentQuestion(user, params.ws, params.id, body), { body: true });
