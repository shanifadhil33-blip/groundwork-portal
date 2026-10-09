import { endpoint } from '../../../../../lib/api';
import { assistant } from '../../../../../lib/services/assistant';
export const POST=endpoint(({user,params,body})=>assistant(user,params.ws,body),{body:true});
