import { endpoint } from '../../../../lib/api';
import * as w from '../../../../lib/services/workspaces';
export const GET = endpoint(({user,params,body,key,req}) => w.getWorkspace(user,params.ws), {});
export const PATCH = endpoint(({user,params,body,key,req}) => w.patchWorkspace(user,params.ws,body), {"body": true});
export const DELETE = endpoint(({user,params,body,key,req}) => w.deleteWorkspace(user,params.ws,body), {"body": true});
