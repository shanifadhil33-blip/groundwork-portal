import { endpoint } from '../../../../../../../lib/api';
import * as supplier from '../../../../../../../lib/services/supplier';
export const POST=endpoint(({user,params,body})=>supplier.setOutage(user,params.ws,body),{body:true});
