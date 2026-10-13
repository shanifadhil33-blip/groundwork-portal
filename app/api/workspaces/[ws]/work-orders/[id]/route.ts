import { endpoint } from '../../../../../../lib/api';
import * as o from '../../../../../../lib/services/work-orders';
export const GET = endpoint(({user,params,body,key,req}) => o.getWorkOrder(user,params.ws,params.id), {"etag": true});
export const PATCH = endpoint(({user,params,body,key,req}) => o.patchWorkOrder(user,params.ws,params.id,body,req.headers.get('If-Match')??undefined), {"body": true, "etag": true});
import { deleteJob } from '../../../../../../lib/services/job-records';
export const DELETE = endpoint(({user,params}) => deleteJob(user,params.ws,params.id), {});
