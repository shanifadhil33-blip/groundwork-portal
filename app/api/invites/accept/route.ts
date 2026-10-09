import { endpoint } from '../../../../lib/api';
import * as i from '../../../../lib/services/invites';
export const POST = endpoint(({user,params,body,key,req}) => i.acceptInvite(user,body,key), {"body": true});
