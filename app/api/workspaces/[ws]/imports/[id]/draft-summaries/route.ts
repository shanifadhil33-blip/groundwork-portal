import { endpoint } from '../../../../../../../lib/api';
import * as imports from '../../../../../../../lib/services/imports';
export const POST=endpoint(({user,params,body,req})=>imports.importDrafts(user,params.ws,params.id),{body:false});
