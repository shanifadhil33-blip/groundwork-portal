import { endpoint } from '../../../../../../../lib/api';
import { setJobPayment } from '../../../../../../../lib/services/payments';
export const POST=endpoint(({user,params,body})=>setJobPayment(user,params.ws,params.id,body),{body:true});
