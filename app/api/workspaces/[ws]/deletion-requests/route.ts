import { endpoint } from '../../../../../lib/api';
import { deletionRequests, requestAccountDeletion } from '../../../../../lib/services/data-protection';
export const GET = endpoint(({user,params}) => deletionRequests(user, params.ws));
export const POST = endpoint(({user,params,body}) => requestAccountDeletion(user, params.ws, body), {body:true});
