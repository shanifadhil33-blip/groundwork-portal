import { endpoint } from '../../../../../../lib/api';
import * as c from '../../../../../../lib/services/clients';
export const GET = endpoint(({user,params,body,key,req}) => c.getClient(user,params.ws,params.id), {});
export const PATCH = endpoint(({user,params,body,key,req}) => c.patchClient(user,params.ws,params.id,body), {"body": true});
export const DELETE = endpoint(({user,params,body,key,req}) => c.deleteClient(user,params.ws,params.id), {});
