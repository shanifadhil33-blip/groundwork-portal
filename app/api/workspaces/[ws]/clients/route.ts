import { endpoint } from '../../../../../lib/api';
import * as c from '../../../../../lib/services/clients';
export const GET = endpoint(({user,params,body,key,req}) => c.listClients(user,params.ws,new URL(req.url).searchParams.get('archived')==='true'), {});
export const POST = endpoint(({user,params,body,key,req}) => c.createClient(user,params.ws,body,key), {"body": true, "status": 201});
