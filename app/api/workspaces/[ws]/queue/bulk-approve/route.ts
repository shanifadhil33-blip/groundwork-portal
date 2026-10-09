import { endpoint } from '../../../../../../lib/api';
import * as imports from '../../../../../../lib/services/imports';
export const POST=endpoint(({user,params,body,req})=>imports.bulkApprove(user,params.ws,body),{body:true});
