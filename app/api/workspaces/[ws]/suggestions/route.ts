import { endpoint } from '../../../../../lib/api';
import { createSuggestion,listSuggestions } from '../../../../../lib/services/suggestions';
export const GET=endpoint(({user,params})=>listSuggestions(user,params.ws));
export const POST=endpoint(({user,params,body,key})=>createSuggestion(user,params.ws,body,undefined,key),{body:true,status:201});
