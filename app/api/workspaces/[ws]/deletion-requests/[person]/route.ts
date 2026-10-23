import { endpoint } from '../../../../../../lib/api';
import { handleAccountDeletion } from '../../../../../../lib/services/data-protection';
export const POST = endpoint(({user,params,body}) => handleAccountDeletion(user, params.ws, params.person, body), {body:true});
