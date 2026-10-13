import { endpoint } from '../../../../../../../lib/api';
import { memberImpact } from '../../../../../../../lib/services/members';
export const GET=endpoint(({user,params})=>memberImpact(user,params.ws,params.userId));
