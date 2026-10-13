import { endpoint } from '../../../../../../lib/api';
import { saveContactName } from '../../../../../../lib/services/contact-names';
export const PATCH=endpoint(({user,params,body})=>saveContactName(user,params.ws,params.id,body),{body:true});
