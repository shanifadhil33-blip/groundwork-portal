import { endpoint } from '../../../../../lib/api';
import * as o from '../../../../../lib/services/work-orders';
export const GET = endpoint(({user,params,body,key,req}) => o.listWorkOrders(user,params.ws,new URL(req.url).searchParams), {});
export const POST = endpoint(({user,params,body,key,req}) => o.createWorkOrder(user,params.ws,body,key), {"body": true, "status": 201, "etag": true});
