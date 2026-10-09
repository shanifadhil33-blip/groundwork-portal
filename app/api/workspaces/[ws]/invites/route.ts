import { endpoint } from '../../../../../lib/api';
import * as i from '../../../../../lib/services/invites';
export const GET = endpoint(({user,params,body,key,req}) => i.listInvites(user,params.ws), {});
export const POST = endpoint(({user,params,body,key,req}) => i.createInvite(user,params.ws,body,key), {"body": true, "status": 201});
