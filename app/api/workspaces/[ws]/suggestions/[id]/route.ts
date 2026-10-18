import { endpoint } from '../../../../../../lib/api';
import { decideSuggestion, withdrawSuggestion } from '../../../../../../lib/services/suggestions';
export const POST=endpoint(({user,params,body})=>decideSuggestion(user,params.ws,params.id,body),{body:true});
export const DELETE=endpoint(({user,params})=>withdrawSuggestion(user,params.ws,params.id));
