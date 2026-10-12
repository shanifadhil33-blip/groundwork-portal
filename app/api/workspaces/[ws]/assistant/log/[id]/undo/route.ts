import { endpoint } from '../../../../../../../../lib/api';
import { undoDecision } from '../../../../../../../../lib/services/agent-log';
export const POST=endpoint(({user,params})=>undoDecision(user,params.ws,params.id));
