import { endpoint } from '../../../../../../lib/api';
import * as s from '../../../../../../lib/services/audit';
export const GET=endpoint(({user,params,req})=>s.getAudit(user,params.ws,params.id));
