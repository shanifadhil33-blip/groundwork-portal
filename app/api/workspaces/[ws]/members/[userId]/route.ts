import { endpoint } from '../../../../../../lib/api';
import * as m from '../../../../../../lib/services/members';
export const PATCH = endpoint(({user,params,body,key,req}) => m.changeMember(user,params.ws,params.userId,body), {"body": true});
export const DELETE = endpoint(({user,params,body,key,req}) => m.changeMember(user,params.ws,params.userId), {});
