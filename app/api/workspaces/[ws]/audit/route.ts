import { endpoint } from '../../../../../lib/api';
import * as s from '../../../../../lib/services/audit';
export const GET=endpoint(({user,params,req})=>s.listAudit(user,params.ws,new URL(req.url).searchParams));
