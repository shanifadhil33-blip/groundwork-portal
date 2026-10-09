import { endpoint } from '../../../../../lib/api';
import * as imports from '../../../../../lib/services/imports';
export const GET=endpoint(({user,params,body,req})=>imports.listQueue(user,params.ws,new URL(req.url).searchParams),{body:false});
