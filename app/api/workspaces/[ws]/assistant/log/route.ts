import { endpoint } from '../../../../../../lib/api';
import { listDecisions } from '../../../../../../lib/services/agent-log';
export const GET=endpoint(({user,params})=>listDecisions(user,params.ws));
