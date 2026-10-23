import { endpoint } from '../../../../../lib/api';
import { closeCompanyForPrivacy } from '../../../../../lib/services/data-protection';
export const POST = endpoint(({user,params,body}) => closeCompanyForPrivacy(user, params.ws, body), {body:true});
