import { endpoint } from '../../../../../lib/api';
import * as m from '../../../../../lib/services/members';
export const GET = endpoint(({user,params,body,key,req}) => m.listMembers(user,params.ws), {});
