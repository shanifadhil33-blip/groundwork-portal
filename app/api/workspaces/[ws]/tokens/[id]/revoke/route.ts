import { endpoint } from '../../../../../../../lib/api';
import { revokeToken } from '../../../../../../../lib/services/tokens';
export const POST=endpoint(({user,params})=>revokeToken(user,params.ws,params.id));
