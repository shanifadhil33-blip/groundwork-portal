import { endpoint } from '../../../../../../../lib/api';
import * as o from '../../../../../../../lib/services/work-orders';
export const POST = endpoint(({user,params,body,key,req}) => o.createComment(user,params.ws,params.id,body,key), {"body": true, "status": 201});
