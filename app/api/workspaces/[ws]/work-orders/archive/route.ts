import { endpoint } from '../../../../../../lib/api';
import { archiveWorkOrders } from '../../../../../../lib/services/work-orders';
export const POST=endpoint(({user,params,body})=>archiveWorkOrders(user,params.ws,body),{body:true});
