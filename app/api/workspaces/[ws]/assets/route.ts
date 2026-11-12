import { endpoint } from '../../../../../lib/api';
import * as a from '../../../../../lib/services/assets';
export const GET = endpoint(({user,params,req}) => a.listAssets(user,params.ws,{site_id:new URL(req.url).searchParams.get('site_id')??undefined}), {});
export const POST = endpoint(({user,params,body,key}) => a.createAsset(user,params.ws,body,key), {body:true});
