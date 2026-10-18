import { endpoint } from '../../../../../../lib/api';
import { listDecisions } from '../../../../../../lib/services/agent-log';
export const GET=endpoint(({user,params,req})=>listDecisions(user,params.ws,Number(new URL(req.url).searchParams.get('limit')??20)));
