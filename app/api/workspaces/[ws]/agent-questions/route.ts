import { endpoint } from '../../../../../lib/api';
import { askSupervisor, listAgentQuestions } from '../../../../../lib/services/agent-questions';
export const GET = endpoint(({ user, params }) => listAgentQuestions(user, params.ws));
export const POST = endpoint(({ user, params, body }) => askSupervisor(user, params.ws, body), { body: true });
