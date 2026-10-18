import { endpoint } from '../../../../../lib/api';
import { askSupervisor, listAgentQuestions } from '../../../../../lib/services/agent-questions';
export const GET = endpoint(({ user, params, req }) => listAgentQuestions(user, params.ws, new URL(req.url).searchParams.get('mine') === '1'));
export const POST = endpoint(({ user, params, body }) => askSupervisor(user, params.ws, body), { body: true });
