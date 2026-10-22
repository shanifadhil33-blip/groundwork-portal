import { endpoint } from '../../../../../../../lib/api';
import { reportClientRefused } from '../../../../../../../lib/services/price-changes';
export const POST = endpoint(({user,params,body,key}) => reportClientRefused(user,params.ws,params.id,body,key), {body:true});
