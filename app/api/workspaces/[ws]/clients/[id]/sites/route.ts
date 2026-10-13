import { endpoint } from '../../../../../../../lib/api';
import * as c from '../../../../../../../lib/services/clients';
export const GET = endpoint(({user,params,body,key,req}) => c.listSites(user,params.ws,params.id,new URL(req.url).searchParams.get('archived')==='true'), {});
export const POST = endpoint(({user,params,body,key,req}) => c.createSite(user,params.ws,params.id,body,key), {"body": true, "status": 201});
