import { endpoint } from '../../../../../../../lib/api';
import * as imports from '../../../../../../../lib/services/imports';
export const POST=endpoint(({user,params,body,req})=>imports.rejectRow(user,params.ws,params.rowId,body),{body:true});
