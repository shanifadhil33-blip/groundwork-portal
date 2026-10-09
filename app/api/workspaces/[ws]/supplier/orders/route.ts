import { endpoint } from '../../../../../../lib/api';
import * as supplier from '../../../../../../lib/services/supplier';
export const GET=endpoint(({user,params})=>supplier.listOrders(user,params.ws));
export const POST=endpoint(({user,params,body})=>supplier.placeOrder(user,params.ws,body),{body:true,status:201});
