import { endpoint } from '../../../../../../lib/api';
import { decideSuggestion } from '../../../../../../lib/services/suggestions';
export const POST=endpoint(({user,params,body})=>decideSuggestion(user,params.ws,params.id,body),{body:true});
