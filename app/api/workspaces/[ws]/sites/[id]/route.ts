import { endpoint } from '../../../../../../lib/api';
import * as c from '../../../../../../lib/services/clients';
export const PATCH = endpoint(({user,params,body,key,req}) => c.patchSite(user,params.ws,params.id,body), {"body": true});
export const DELETE = endpoint(({user,params,body,key,req}) => c.deleteSite(user,params.ws,params.id), {});
