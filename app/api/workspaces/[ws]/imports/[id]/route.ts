import { endpoint } from '../../../../../../lib/api';
import * as imports from '../../../../../../lib/services/imports';
export const GET=endpoint(({user,params,body,req})=>imports.getImport(user,params.ws,params.id),{body:false});
