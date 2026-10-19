import { endpoint } from '../../../../../../lib/api';
import * as a from '../../../../../../lib/services/assets';
export const GET = endpoint(({user,params}) => a.getAsset(user,params.ws,params.id), {});
export const PATCH = endpoint(({user,params,body}) => a.updateAsset(user,params.ws,params.id,body), {body:true});
