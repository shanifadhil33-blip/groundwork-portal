import { endpoint } from '../../../../../lib/api';
import * as imports from '../../../../../lib/services/imports';
export const GET=endpoint(({user,params,body,req})=>imports.listImports(user,params.ws),{body:false});
export const POST=endpoint(({user,params,body,req})=>imports.uploadImport(user,params.ws,req),{body:false});
