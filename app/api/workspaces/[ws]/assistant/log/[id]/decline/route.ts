import { endpoint } from '../../../../../../../../lib/api';
import { declineDecision } from '../../../../../../../../lib/services/agent-log';
export const POST=endpoint(({user,params})=>declineDecision(user,params.ws,params.id));
