import { endpoint } from '../../../../../lib/api';
import { addFieldWorker } from '../../../../../lib/services/field-signin';
export const POST = endpoint(({user,params,body}) => addFieldWorker(user,params.ws,body), {body:true,status:201});
