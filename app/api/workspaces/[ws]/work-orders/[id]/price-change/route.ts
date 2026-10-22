import { endpoint } from '../../../../../../../lib/api';
import { reportPriceChange } from '../../../../../../../lib/services/price-changes';
export const POST = endpoint(({user,params,body,key}) => reportPriceChange(user,params.ws,params.id,body,key), {body:true});
