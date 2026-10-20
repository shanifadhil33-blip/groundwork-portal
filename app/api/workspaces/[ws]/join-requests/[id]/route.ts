import { endpoint } from '../../../../../../lib/api';
import * as s from '../../../../../../lib/services/company-listing';
export const PATCH=endpoint(({user,params,body})=>s.decideJoinRequest(user,params.ws,params.id,body),{body:true});
